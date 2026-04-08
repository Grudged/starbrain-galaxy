import * as THREE from 'three';
import { VIEW } from './data.js';

// Easing functions
const easings = {
  cubicInOut: (t) => {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  linear: (t) => t,
};

// Camera positions for each view level
export const CAMERA_PRESETS = {
  [VIEW.GALAXY]: {
    position: new THREE.Vector3(0, 8, 20),
    lookAt: new THREE.Vector3(0, 0, -5),
  },
};

// Returns a camera position for system view given the system's galaxy position
export function systemCameraPos(systemPos) {
  const pos = new THREE.Vector3(systemPos.x, systemPos.y, systemPos.z);
  // Offset: slightly above and in front of the system, 6 units away
  const offset = new THREE.Vector3(0, 2.5, 6);
  return {
    position: pos.clone().add(offset),
    lookAt: pos.clone(),
  };
}

// Returns camera position for planet view given the planet's world position
export function planetCameraPos(planetPos) {
  const pos = new THREE.Vector3(planetPos.x, planetPos.y, planetPos.z);
  // 3 units away, slightly above equator
  const offset = new THREE.Vector3(0, 1.2, 3);
  return {
    position: pos.clone().add(offset),
    lookAt: pos.clone(),
  };
}

export function createCameraController(camera) {
  // State machine
  const STATE = { IDLE: 'idle', ANIMATING: 'animating' };

  let state = STATE.IDLE;
  let currentView = VIEW.GALAXY;

  // Live camera lookAt target (tracked separately since THREE doesn't expose it)
  const currentLookAt = new THREE.Vector3(0, 0, -5);

  // Animation state
  let anim = null;
  /*
    anim = {
      fromPos: Vector3,
      fromLookAt: Vector3,
      toPos: Vector3,
      toLookAt: Vector3,
      duration: number (seconds),
      elapsed: number (seconds),
      easingFn: function,
      arcHeight: number,
      resolve: function,
    }
  */

  // Orbit state (planet view only)
  let orbit = null;
  /*
    orbit = {
      center: Vector3,
      radius: number,
      angle: number,
      yOffset: number,
      speed: number (rad/s),
    }
  */

  // Apply initial galaxy position
  camera.position.copy(CAMERA_PRESETS[VIEW.GALAXY].position);
  camera.lookAt(currentLookAt);

  // -------------------------------------------------------------------------
  // flyTo — main transition entry point
  // -------------------------------------------------------------------------
  function flyTo(targetPos, targetLookAt, duration, easing) {
    // Stop any active orbit
    orbit = null;

    const easingFn =
      typeof easing === 'function'
        ? easing
        : easings[easing] ?? easings.cubicInOut;

    const fromPos = camera.position.clone();
    const fromLookAt = currentLookAt.clone();
    const toPos = targetPos instanceof THREE.Vector3
      ? targetPos.clone()
      : new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
    const toLookAt = targetLookAt instanceof THREE.Vector3
      ? targetLookAt.clone()
      : new THREE.Vector3(targetLookAt.x, targetLookAt.y, targetLookAt.z);

    // Arc height proportional to distance (~15% of travel distance)
    const distance = fromPos.distanceTo(toPos);
    const arcHeight = distance * 0.15;

    return new Promise((resolve) => {
      anim = {
        fromPos,
        fromLookAt,
        toPos,
        toLookAt,
        duration,
        elapsed: 0,
        easingFn,
        arcHeight,
        resolve,
      };
      state = STATE.ANIMATING;
    });
  }

  // -------------------------------------------------------------------------
  // update — call every frame with deltaTime in seconds
  // -------------------------------------------------------------------------
  function update(deltaTime) {
    if (state === STATE.ANIMATING && anim) {
      anim.elapsed += deltaTime;
      const rawT = Math.min(anim.elapsed / anim.duration, 1);
      const t = anim.easingFn(rawT);

      // Interpolate position
      const interpPos = new THREE.Vector3().lerpVectors(
        anim.fromPos,
        anim.toPos,
        t
      );

      // Add cinematic arc on Y — peaks at mid-flight, zeros out at start/end
      const arcY = Math.sin(rawT * Math.PI) * anim.arcHeight;
      interpPos.y += arcY;

      // Interpolate lookAt
      const interpLookAt = new THREE.Vector3().lerpVectors(
        anim.fromLookAt,
        anim.toLookAt,
        t
      );

      camera.position.copy(interpPos);
      camera.lookAt(interpLookAt);
      currentLookAt.copy(interpLookAt);

      // Animation complete
      if (rawT >= 1) {
        // Snap to exact target (no arc residual)
        camera.position.copy(anim.toPos);
        camera.lookAt(anim.toLookAt);
        currentLookAt.copy(anim.toLookAt);

        const resolve = anim.resolve;
        anim = null;
        state = STATE.IDLE;
        resolve();
      }

      return;
    }

    // Gentle auto-orbit in planet view
    if (orbit && state === STATE.IDLE) {
      orbit.angle += orbit.speed * deltaTime;

      const x = orbit.center.x + Math.sin(orbit.angle) * orbit.radius;
      const z = orbit.center.z + Math.cos(orbit.angle) * orbit.radius;
      const y = orbit.center.y + orbit.yOffset;

      camera.position.set(x, y, z);
      camera.lookAt(orbit.center);
      currentLookAt.copy(orbit.center);
    }
  }

  // -------------------------------------------------------------------------
  // getCurrentView / setView
  // -------------------------------------------------------------------------
  function getCurrentView() {
    return currentView;
  }

  function setView(view) {
    currentView = view;

    // Stop animation and orbit
    if (anim) {
      const resolve = anim.resolve;
      anim = null;
      state = STATE.IDLE;
      resolve();
    }
    orbit = null;

    if (view === VIEW.GALAXY) {
      const preset = CAMERA_PRESETS[VIEW.GALAXY];
      camera.position.copy(preset.position);
      camera.lookAt(preset.lookAt);
      currentLookAt.copy(preset.lookAt);
    }
  }

  // -------------------------------------------------------------------------
  // Convenience: start planet orbit after arriving in planet view
  // -------------------------------------------------------------------------
  function startPlanetOrbit(planetWorldPos, radius = 3, yOffset = 1.2, speed = 0.1) {
    const center = planetWorldPos instanceof THREE.Vector3
      ? planetWorldPos.clone()
      : new THREE.Vector3(planetWorldPos.x, planetWorldPos.y, planetWorldPos.z);

    // Calculate starting angle from current camera position so there's no jump
    const dx = camera.position.x - center.x;
    const dz = camera.position.z - center.z;
    const startAngle = Math.atan2(dx, dz);

    orbit = {
      center,
      radius,
      angle: startAngle,
      yOffset,
      speed,
    };
  }

  function stopOrbit() {
    orbit = null;
  }

  // -------------------------------------------------------------------------
  // High-level named transitions — use these from the scene controller
  // -------------------------------------------------------------------------

  /**
   * Fly from galaxy to a specific system.
   * @param {object} system — SYSTEMS entry with galaxyPos
   */
  async function flyToSystem(system) {
    const { position, lookAt } = systemCameraPos(system.galaxyPos);
    currentView = VIEW.SYSTEM;
    await flyTo(position, lookAt, 2.5);
  }

  /**
   * Fly from system to the system's planet.
   * Assumes planet is rendered at an offset from the system center.
   * @param {THREE.Vector3} planetWorldPos — world position of the planet mesh
   */
  async function flyToPlanet(planetWorldPos) {
    const { position, lookAt } = planetCameraPos(planetWorldPos);
    currentView = VIEW.PLANET;
    await flyTo(position, lookAt, 1.8);
    // Begin gentle orbit once we've arrived
    const center = planetWorldPos instanceof THREE.Vector3
      ? planetWorldPos.clone()
      : new THREE.Vector3(planetWorldPos.x, planetWorldPos.y, planetWorldPos.z);
    startPlanetOrbit(center);
  }

  /**
   * Fly back to the galaxy overview from any view.
   */
  async function flyToGalaxy() {
    orbit = null; // immediately stop orbiting
    const preset = CAMERA_PRESETS[VIEW.GALAXY];
    currentView = VIEW.GALAXY;
    await flyTo(preset.position, preset.lookAt, 2.0);
  }

  /**
   * Fly back from planet to the system view.
   * @param {object} system — SYSTEMS entry with galaxyPos
   */
  async function flyToSystemFromPlanet(system) {
    orbit = null;
    const { position, lookAt } = systemCameraPos(system.galaxyPos);
    currentView = VIEW.SYSTEM;
    await flyTo(position, lookAt, 1.8);
  }

  // -------------------------------------------------------------------------
  // isAnimating / getCamera
  // -------------------------------------------------------------------------
  function isAnimating() {
    return state === STATE.ANIMATING;
  }

  function getCamera() {
    return camera;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  return {
    // Core
    flyTo,
    getCurrentView,
    setView,
    isAnimating,
    update,
    getCamera,

    // Named transitions (convenience wrappers)
    flyToSystem,
    flyToPlanet,
    flyToGalaxy,
    flyToSystemFromPlanet,

    // Orbit control
    startPlanetOrbit,
    stopOrbit,
  };
}
