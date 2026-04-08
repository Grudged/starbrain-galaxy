import * as THREE from 'three';
import { SYSTEMS, VIEW } from './data.js';
import { createStarfield, createNebula } from './Starfield.js';
import { createPlanet } from './Planet.js';
import { createCameraController } from './CameraController.js';
import { createSystemMarker, createSystemScene } from './StarSystem.js';

// ── Renderer ──────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ── Scene & Camera ────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

const clock = new THREE.Clock();

// ── Environment: always-visible starfield + nebulae ───────────────────────────

const starfield = createStarfield(scene);
const nebula    = createNebula(scene);

// ── Camera controller ─────────────────────────────────────────────────────────

const cameraController = createCameraController(camera);

// ── System objects — built once, shown/hidden per view ────────────────────────

/*
  systemObjects[id] = {
    system,        // SYSTEMS entry
    marker,        // Object3D from createSystemMarker — galaxy view dot
    planet,        // Object3D from createPlanet — the planet mesh
    systemScene,   // Object3D from createSystemScene — star + orbit + dust
  }
*/
const systemObjects = {};

for (const system of SYSTEMS) {
  const marker      = createSystemMarker(system, scene);
  const planet      = createPlanet(system.planet, scene);
  const systemScene = createSystemScene(system, scene);

  // Tag the marker for raycasting
  marker.traverse((obj) => {
    if (obj.isMesh || obj.isPoints) {
      obj.userData.systemId = system.id;
    }
  });
  // Also tag the root in case it's a Mesh itself
  marker.userData.systemId = system.id;

  // System scene is hidden until we enter it
  systemScene.visible = false;

  systemObjects[system.id] = { system, marker, planet, systemScene };
}

// Track active system and planet mesh for click testing
let activeSystemId = null;

// Collect all marker meshes for raycasting (galaxy view)
function getMarkerMeshes() {
  const meshes = [];
  for (const { marker } of Object.values(systemObjects)) {
    marker.traverse((obj) => {
      if (obj.isMesh || obj.isPoints) meshes.push(obj);
    });
  }
  return meshes;
}

// Collect planet mesh(es) for raycasting (system/planet view)
function getPlanetMeshes() {
  if (!activeSystemId) return [];
  const { planet } = systemObjects[activeSystemId];
  const meshes = [];
  planet.traverse((obj) => {
    if (obj.isMesh) {
      obj.userData.isPlanet = true;
      meshes.push(obj);
    }
  });
  return meshes;
}

// ── HUD refs ──────────────────────────────────────────────────────────────────

const hudTitle   = document.getElementById('hud-title');
const hudSubtitle = document.getElementById('hud-subtitle');
const btnBack    = document.getElementById('btn-back');
const planetInfo  = document.getElementById('planet-info');
const planetName  = document.getElementById('planet-name');
const planetDesc  = document.getElementById('planet-desc');
const planetEnter = document.getElementById('planet-enter');

// ── HUD helpers ───────────────────────────────────────────────────────────────

function setHUD({ title, subtitle, back, info }) {
  // title
  if (title !== undefined) {
    hudTitle.textContent = title;
    hudTitle.classList.toggle('visible', Boolean(title));
  }
  // subtitle
  if (subtitle !== undefined) {
    hudSubtitle.textContent = subtitle ?? '';
    hudSubtitle.classList.toggle('visible', Boolean(subtitle));
  }
  // back button
  if (back !== undefined) {
    btnBack.classList.toggle('visible', Boolean(back));
    // pointer-events controlled by .visible opacity, but also ensure it's clickable
    btnBack.style.pointerEvents = back ? 'auto' : 'none';
  }
  // planet info panel
  if (info !== undefined) {
    planetInfo.classList.toggle('visible', Boolean(info));
    planetInfo.style.pointerEvents = info ? 'auto' : 'none';
  }
}

// ── State machine ─────────────────────────────────────────────────────────────

let currentView = VIEW.GALAXY;
let transitioning = false;

// ── Galaxy view ───────────────────────────────────────────────────────────────

function enterGalaxyView() {
  currentView = VIEW.GALAXY;

  // Show all markers, hide all system scenes and planets
  for (const { marker, systemScene, planet } of Object.values(systemObjects)) {
    marker.visible = true;
    setMarkerDim(marker, false);
    systemScene.visible = false;
    planet.visible = false;
  }

  activeSystemId = null;

  setHUD({
    title: 'StarBrain Galaxy',
    subtitle: 'Click a star system to explore',
    back: false,
    info: false,
  });
}

function setMarkerDim(marker, dimmed) {
  marker.traverse((obj) => {
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        m.opacity = dimmed ? 0.2 : 1.0;
        m.transparent = true;
      }
    }
  });
}

// ── System view ───────────────────────────────────────────────────────────────

function enterSystemView(systemId) {
  currentView = VIEW.SYSTEM;
  activeSystemId = systemId;

  const active = systemObjects[systemId];

  for (const [id, obj] of Object.entries(systemObjects)) {
    if (id === systemId) {
      obj.marker.visible = false;       // hide own marker — the system scene replaces it
      obj.systemScene.visible = true;
      obj.planet.visible = true;        // planet orbits in system view
    } else {
      obj.marker.visible = false;       // hide other markers for a clean look
      obj.systemScene.visible = false;
      obj.planet.visible = false;
    }
  }

  setHUD({
    title: active.system.name,
    subtitle: false,
    back: true,
    info: false,
  });
}

// ── Planet view ───────────────────────────────────────────────────────────────

function enterPlanetView(systemId) {
  currentView = VIEW.PLANET;
  // Planet mesh is already visible from system view — nothing to toggle
  const system = systemObjects[systemId].system;

  planetName.textContent = system.name;
  planetDesc.textContent = system.desc;

  setHUD({
    title: system.name,
    subtitle: false,
    back: true,
    info: true,
  });
}

// ── Click transitions ─────────────────────────────────────────────────────────

async function goToSystem(systemId) {
  if (transitioning) return;
  transitioning = true;

  enterSystemView(systemId);

  const system = systemObjects[systemId].system;
  await cameraController.flyToSystem(system);

  transitioning = false;
}

async function goToPlanet(systemId) {
  if (transitioning) return;
  transitioning = true;

  enterPlanetView(systemId);

  // Get world position of the planet mesh
  const { planet } = systemObjects[systemId];
  const planetWorldPos = new THREE.Vector3();
  planet.getWorldPosition(planetWorldPos);

  await cameraController.flyToPlanet(planetWorldPos);

  transitioning = false;
}

async function goBackFromPlanet() {
  if (transitioning) return;
  transitioning = true;

  const system = systemObjects[activeSystemId].system;

  currentView = VIEW.SYSTEM;
  setHUD({
    title: system.name,
    subtitle: false,
    back: true,
    info: false,
  });
  planetInfo.classList.remove('visible');
  planetInfo.style.pointerEvents = 'none';

  await cameraController.flyToSystemFromPlanet(system);

  transitioning = false;
}

async function goBackFromSystem() {
  if (transitioning) return;
  transitioning = true;

  // Immediately update HUD so the user sees a response
  setHUD({
    title: 'StarBrain Galaxy',
    subtitle: 'Click a star system to explore',
    back: false,
    info: false,
  });

  await cameraController.flyToGalaxy();

  // Restore all scene objects once camera is back
  enterGalaxyView();

  transitioning = false;
}

// ── Back button ───────────────────────────────────────────────────────────────

btnBack.addEventListener('click', () => {
  if (transitioning) return;
  if (currentView === VIEW.PLANET) {
    goBackFromPlanet();
  } else if (currentView === VIEW.SYSTEM) {
    goBackFromSystem();
  }
});

// ── Planet enter button ───────────────────────────────────────────────────────

planetEnter.addEventListener('click', () => {
  if (!activeSystemId) return;
  console.log('Enter:', activeSystemId);
});

// ── Raycaster + click detection ───────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2();

// Track pointerdown position to distinguish click from drag
let pointerDownX = 0;
let pointerDownY = 0;

function toNDC(clientX, clientY) {
  return new THREE.Vector2(
    (clientX / window.innerWidth)  *  2 - 1,
    (clientY / window.innerHeight) * -2 + 1
  );
}

window.addEventListener('pointerdown', (e) => {
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
});

window.addEventListener('pointerup', (e) => {
  if (transitioning) return;

  const dx = e.clientX - pointerDownX;
  const dy = e.clientY - pointerDownY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist >= 5) return; // was a drag, not a tap

  const ndc = toNDC(e.clientX, e.clientY);
  raycaster.setFromCamera(ndc, camera);

  if (currentView === VIEW.GALAXY) {
    // Test against all system marker meshes
    const hits = raycaster.intersectObjects(getMarkerMeshes(), false);
    if (hits.length > 0) {
      const systemId = hits[0].object.userData.systemId;
      if (systemId) goToSystem(systemId);
    }
    return;
  }

  if (currentView === VIEW.SYSTEM) {
    // Test against the active system's planet mesh
    const hits = raycaster.intersectObjects(getPlanetMeshes(), false);
    if (hits.length > 0) {
      goToPlanet(activeSystemId);
    }
  }

  // PLANET view clicks are handled by the HTML panel buttons
});

// ── System labels (HTML) ─────────────────────────────────────────────────────
// Create a floating label for each system in the galaxy view.
// We project each system's galaxy position to screen space every frame.

const labelContainer = document.createElement('div');
labelContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;';
document.body.appendChild(labelContainer);

const systemLabels = {};
for (const system of SYSTEMS) {
  const label = document.createElement('div');
  label.className = 'system-label';
  label.textContent = system.name;
  label.style.position = 'absolute';
  label.style.pointerEvents = 'auto';
  label.addEventListener('click', () => {
    if (currentView === VIEW.GALAXY && !transitioning) goToSystem(system.id);
  });
  labelContainer.appendChild(label);
  systemLabels[system.id] = label;
}

const _v3  = new THREE.Vector3();
const _ndc = new THREE.Vector3();

function updateLabels() {
  const inGalaxy = currentView === VIEW.GALAXY;

  for (const [id, label] of Object.entries(systemLabels)) {
    if (!inGalaxy) {
      label.style.display = 'none';
      continue;
    }
    const gp = systemObjects[id].system.galaxyPos;
    _v3.set(gp.x, gp.y, gp.z);
    _ndc.copy(_v3).project(camera);

    // If behind the camera or outside a generous frustum, hide the label
    if (_ndc.z > 1 || Math.abs(_ndc.x) > 1.3 || Math.abs(_ndc.y) > 1.3) {
      label.style.display = 'none';
      continue;
    }

    const sx = (_ndc.x *  0.5 + 0.5) * window.innerWidth;
    const sy = (_ndc.y * -0.5 + 0.5) * window.innerHeight;

    label.style.display  = '';
    label.style.left     = `${sx}px`;
    label.style.top      = `${sy + 18}px`;                // just below the dot
    label.style.transform = 'translateX(-50%)';
  }
}

// ── Resize handler ────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ── Animation loop ────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  const time  = performance.now() * 0.001;
  const delta = clock.getDelta();

  // Background always animates
  starfield.update(time);
  nebula.update(time);

  // Camera (handles fly-to and planet orbit)
  cameraController.update(delta);

  // Animate visible system scenes
  for (const [id, obj] of Object.entries(systemObjects)) {
    if (obj.systemScene.visible && obj.systemScene.update) {
      obj.systemScene.update(time, delta);
    }
    // Animate planets when in system or planet view
    if (obj.planet.visible && obj.planet.update) {
      obj.planet.update(time, delta);
    }
    // Animate markers in galaxy view
    if (currentView === VIEW.GALAXY && obj.marker.visible && obj.marker.update) {
      obj.marker.update(time, delta);
    }
  }

  // Keep HTML labels projected onto screen
  updateLabels();

  renderer.render(scene, camera);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

// Start in galaxy view
enterGalaxyView();

// Hide loading screen after 1.5 s
const loading = document.getElementById('loading');
setTimeout(() => {
  loading.classList.add('done');
  // Remove from DOM after fade
  setTimeout(() => loading.remove(), 900);
}, 1500);

// Kick off render loop
animate();
