import * as THREE from 'three';

// ── Easing helpers ────────────────────────────────────────────────────────────

function cubicIn(t)  { return t * t * t; }
function cubicOut(t) { return 1 - Math.pow(1 - t, 3); }
function lerp(a, b, t) { return a + (b - a) * t; }

// Maps a value from [inMin, inMax] → [0, 1], clamped
function invLerp(value, inMin, inMax) {
  return Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
}

// ── Overlay DOM factory ───────────────────────────────────────────────────────

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'atmo-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 50;
    overflow: hidden;
  `;

  // Vignette ring (darkens edges during descent)
  const vignette = document.createElement('div');
  vignette.id = 'atmo-vignette';
  vignette.style.cssText = `
    position: absolute;
    inset: 0;
    opacity: 0;
    background: radial-gradient(
      ellipse at center,
      transparent 30%,
      rgba(0, 0, 0, 0.6) 70%,
      rgba(0, 0, 0, 0.95) 100%
    );
    transition: none;
  `;

  // Heat streaks container (orange/red lines at edges)
  const heat = document.createElement('div');
  heat.id = 'atmo-heat';
  heat.style.cssText = `
    position: absolute;
    inset: 0;
    opacity: 0;
  `;

  // Build individual streak lines radiating inward from all edges
  const streakDefs = [
    // top edge
    { top: '0', left: '10%',  width: '2px',  height: '35%', angle: '8deg' },
    { top: '0', left: '25%',  width: '3px',  height: '45%', angle: '-4deg' },
    { top: '0', left: '45%',  width: '1px',  height: '30%', angle: '2deg' },
    { top: '0', left: '60%',  width: '2px',  height: '42%', angle: '-6deg' },
    { top: '0', left: '80%',  width: '3px',  height: '38%', angle: '10deg' },
    // bottom edge
    { bottom: '0', left: '15%', width: '2px', height: '35%', angle: '-8deg' },
    { bottom: '0', left: '35%', width: '3px', height: '40%', angle: '3deg' },
    { bottom: '0', left: '55%', width: '1px', height: '32%', angle: '-2deg' },
    { bottom: '0', left: '75%', width: '2px', height: '44%', angle: '7deg' },
    // left edge
    { top: '20%', left: '0', width: '35%', height: '2px', angle: '5deg', horiz: true },
    { top: '45%', left: '0', width: '30%', height: '3px', angle: '-3deg', horiz: true },
    { top: '70%', left: '0', width: '38%', height: '1px', angle: '8deg', horiz: true },
    // right edge
    { top: '15%', right: '0', width: '35%', height: '2px', angle: '-5deg', horiz: true },
    { top: '50%', right: '0', width: '42%', height: '3px', angle: '4deg', horiz: true },
    { top: '75%', right: '0', width: '30%', height: '1px', angle: '-7deg', horiz: true },
  ];

  for (const def of streakDefs) {
    const streak = document.createElement('div');
    const isHoriz = def.horiz;
    const gradient = isHoriz
      ? (def.right
          ? 'linear-gradient(to left, rgba(255,80,0,0.9), rgba(255,140,0,0.5), transparent)'
          : 'linear-gradient(to right, rgba(255,80,0,0.9), rgba(255,140,0,0.5), transparent)')
      : (def.bottom
          ? 'linear-gradient(to top, rgba(255,80,0,0.9), rgba(255,140,0,0.5), transparent)'
          : 'linear-gradient(to bottom, rgba(255,80,0,0.9), rgba(255,140,0,0.5), transparent)');

    const css = {
      position: 'absolute',
      background: gradient,
      width: def.width,
      height: def.height,
      transform: `rotate(${def.angle})`,
      transformOrigin: def.bottom ? 'bottom center' : def.right ? 'right center' : 'top left',
    };
    if (def.top    !== undefined) css.top    = def.top;
    if (def.bottom !== undefined) css.bottom = def.bottom;
    if (def.left   !== undefined) css.left   = def.left;
    if (def.right  !== undefined) css.right  = def.right;

    Object.assign(streak.style, css);
    heat.appendChild(streak);
  }

  // Fog/cloud flash (white semi-transparent overlay)
  const fog = document.createElement('div');
  fog.id = 'atmo-fog';
  fog.style.cssText = `
    position: absolute;
    inset: 0;
    opacity: 0;
    background: rgba(200, 220, 255, 0.85);
  `;

  overlay.appendChild(vignette);
  overlay.appendChild(heat);
  overlay.appendChild(fog);
  document.body.appendChild(overlay);

  return { overlay, vignette, heat, fog };
}

// ── Screen shake utility ───────────────────────────────────────────────────────

function applyShake(camera, intensity) {
  if (intensity <= 0) return;
  const rx = (Math.random() - 0.5) * intensity * 0.02;
  const ry = (Math.random() - 0.5) * intensity * 0.02;
  camera.rotation.x += rx;
  camera.rotation.y += ry;
}

// ── Animation loop runner ─────────────────────────────────────────────────────
// Runs a callback(progress 0→1) over `duration` seconds using rAF.
// Returns a Promise that resolves when done.

function runAnimation(duration, onTick) {
  return new Promise((resolve) => {
    let startTime = null;

    function tick(now) {
      if (!startTime) startTime = now;
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);

      onTick(progress);

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}

// ── Main factory ──────────────────────────────────────────────────────────────

export function createAtmosphericEntry(camera, scene) {

  // ── enter ───────────────────────────────────────────────────────────────────

  async function enter(planetPosition, terrainGroup, duration = 3.0) {
    // Snapshot camera state at the moment we start
    const startPos    = camera.position.clone();
    const startQuat   = camera.quaternion.clone();

    // Planet center in world space
    const planetPos = planetPosition instanceof THREE.Vector3
      ? planetPosition.clone()
      : new THREE.Vector3(planetPosition.x, planetPosition.y, planetPosition.z);

    // Target: directly above the planet surface, looking down
    const orbitAltitude = 60;
    const surfaceTarget = planetPos.clone().add(new THREE.Vector3(0, orbitAltitude, 0));

    // Phase 1 intermediate: pull back slightly from current pos, tilt to look at planet
    const pullBackPos = startPos.clone().add(
      startPos.clone().sub(planetPos).normalize().multiplyScalar(2)
    );

    // Build quaternions for key orientations
    const lookAtPlanet = new THREE.Quaternion();
    {
      const dummy = new THREE.Object3D();
      dummy.position.copy(pullBackPos);
      dummy.lookAt(planetPos);
      lookAtPlanet.copy(dummy.quaternion);
    }

    const lookDownQuat = new THREE.Quaternion();
    {
      const dummy = new THREE.Object3D();
      dummy.position.copy(surfaceTarget);
      dummy.lookAt(planetPos);
      lookDownQuat.copy(dummy.quaternion);
    }

    // Terrain is hidden until phase 2
    if (terrainGroup) terrainGroup.visible = false;

    // Create the overlay
    const { overlay, vignette, heat, fog } = createOverlay();

    // Save original camera rotation so we can restore after shake offsets
    const baseQuat = new THREE.Quaternion();

    await runAnimation(duration, (progress) => {

      // ── Phase 1: 0→30% — pull back, tilt to look at planet ────────────────
      if (progress < 0.30) {
        const t = invLerp(progress, 0, 0.30);
        const tEased = cubicOut(t);

        camera.position.lerpVectors(startPos, pullBackPos, tEased);
        camera.quaternion.slerpQuaternions(startQuat, lookAtPlanet, tEased);

        // Vignette starts building slightly
        vignette.style.opacity = lerp(0, 0.3, tEased);
        heat.style.opacity     = 0;
        fog.style.opacity      = 0;

      // ── Phase 2: 30→70% — plunge toward surface ────────────────────────────
      } else if (progress < 0.70) {
        const t = invLerp(progress, 0.30, 0.70);
        const tEased = cubicIn(t);  // accelerating

        // From pullBack to just above surface target, with a curve inward
        const midPoint = new THREE.Vector3().lerpVectors(pullBackPos, surfaceTarget, tEased);
        // Add a slight inward curve by pulling toward planet center during mid-flight
        const curvePull = planetPos.clone().sub(midPoint).normalize().multiplyScalar(
          Math.sin(t * Math.PI) * 8
        );
        camera.position.copy(midPoint).add(curvePull);
        camera.quaternion.slerpQuaternions(lookAtPlanet, lookDownQuat, tEased);

        // Terrain reveals once plunge is well underway
        if (t > 0.4 && terrainGroup) terrainGroup.visible = true;

        // Visual intensity ramps up through this phase
        vignette.style.opacity = lerp(0.3, 0.85, tEased);
        heat.style.opacity     = lerp(0, 0.9, tEased);
        fog.style.opacity      = 0;

        // Screen shake intensifies — max at ~t=0.7
        const shakeIntensity = Math.sin(t * Math.PI) * 1.4;
        applyShake(camera, shakeIntensity);

      // ── Phase 3: 70→90% — cloud layer flash ────────────────────────────────
      } else if (progress < 0.90) {
        const t = invLerp(progress, 0.70, 0.90);

        camera.position.lerpVectors(
          // approximate current position interpolated toward surface
          new THREE.Vector3().lerpVectors(pullBackPos, surfaceTarget, 1),
          surfaceTarget,
          t
        );
        camera.quaternion.copy(lookDownQuat);

        // Fog peaks at t=0.4, then clears
        const fogPeak = Math.sin(t * Math.PI);
        fog.style.opacity      = lerp(0, 0.75, fogPeak);
        heat.style.opacity     = lerp(0.9, 0.0, t);
        vignette.style.opacity = lerp(0.85, 0.4, t);

        // Light shake lingers
        applyShake(camera, 0.6 * (1 - t));

      // ── Phase 4: 90→100% — settle into surface orbit ───────────────────────
      } else {
        const t = invLerp(progress, 0.90, 1.0);
        const tEased = cubicOut(t);

        camera.position.copy(surfaceTarget);
        camera.quaternion.copy(lookDownQuat);

        // Ensure terrain is visible
        if (terrainGroup) terrainGroup.visible = true;

        // All effects fade out
        fog.style.opacity      = lerp(0.0, 0, tEased);
        heat.style.opacity     = 0;
        vignette.style.opacity = lerp(0.4, 0, tEased);
      }
    });

    // Clean up overlay
    overlay.remove();

    // Snap camera to final settled position
    camera.position.copy(surfaceTarget);
    camera.quaternion.copy(lookDownQuat);
    if (terrainGroup) terrainGroup.visible = true;
  }

  // ── exit ────────────────────────────────────────────────────────────────────

  async function exit(planetPosition, duration = 2.5) {
    const planetPos = planetPosition instanceof THREE.Vector3
      ? planetPosition.clone()
      : new THREE.Vector3(planetPosition.x, planetPosition.y, planetPosition.z);

    // Start position: current camera (settled above surface)
    const startPos  = camera.position.clone();
    const startQuat = camera.quaternion.clone();

    // Exit target: same orbital distance as the planet view camera preset
    // (3 units away, slightly above equator — matching CameraController planetCameraPos)
    const orbitOffset = new THREE.Vector3(0, 1.2, 3);
    const orbitTarget = planetPos.clone().add(orbitOffset);

    const orbitLookQuat = new THREE.Quaternion();
    {
      const dummy = new THREE.Object3D();
      dummy.position.copy(orbitTarget);
      dummy.lookAt(planetPos);
      orbitLookQuat.copy(dummy.quaternion);
    }

    // Create a lightweight exit overlay (no heat streaks — just vignette fade)
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50;overflow:hidden;';

    const vignette = document.createElement('div');
    vignette.style.cssText = `
      position:absolute;inset:0;opacity:0;
      background:radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.9) 100%);
    `;

    const fog = document.createElement('div');
    fog.style.cssText = 'position:absolute;inset:0;opacity:0;background:rgba(200,220,255,0.7);';

    overlay.appendChild(vignette);
    overlay.appendChild(fog);
    document.body.appendChild(overlay);

    await runAnimation(duration, (progress) => {

      // Phase 1: 0→20% — vignette in + quick white fog (reverse cloud layer)
      if (progress < 0.20) {
        const t = invLerp(progress, 0, 0.20);
        vignette.style.opacity = lerp(0, 0.7, cubicIn(t));
        fog.style.opacity      = lerp(0, 0.6, cubicIn(t));

        // Slight shake as we punch back through clouds
        applyShake(camera, 0.5 * t);

      // Phase 2: 20→80% — ascend toward orbit
      } else if (progress < 0.80) {
        const t = invLerp(progress, 0.20, 0.80);
        const tEased = cubicOut(t);

        camera.position.lerpVectors(startPos, orbitTarget, tEased);
        camera.quaternion.slerpQuaternions(startQuat, orbitLookQuat, tEased);

        fog.style.opacity      = lerp(0.6, 0, cubicOut(t));
        vignette.style.opacity = lerp(0.7, 0.2, tEased);

      // Phase 3: 80→100% — clear and settle
      } else {
        const t = invLerp(progress, 0.80, 1.0);

        camera.position.copy(orbitTarget);
        camera.quaternion.copy(orbitLookQuat);

        vignette.style.opacity = lerp(0.2, 0, cubicOut(t));
        fog.style.opacity      = 0;
      }
    });

    overlay.remove();

    // Snap to final orbit position
    camera.position.copy(orbitTarget);
    camera.quaternion.copy(orbitLookQuat);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return { enter, exit };
}
