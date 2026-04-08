import * as THREE from 'three';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_DISTANCE   = 5;   // closest camera altitude above surface (units)
const MAX_DISTANCE   = 80;  // farthest camera altitude (full planet overview)
const DEFAULT_DIST   = 60;  // start altitude when entering surface mode
const FRICTION       = 0.88; // momentum decay per frame (0–1, lower = more friction)
const DAMPING        = 0.10; // interpolation factor per frame toward target
const ELEVATION_MIN  = -Math.PI * (80 / 180);
const ELEVATION_MAX  =  Math.PI * (80 / 180);

const SIGNAL_RADIUS   = 3.0; // distance (world units) for "signal detected"
const DISCOVER_RADIUS = 1.5; // distance for "click to discover"

// Signal-strength colour stops: 0 → blue, 0.4 → yellow, 0.7 → orange, 1 → red
const BEAM_COLORS = [
  new THREE.Color(0x2266ff), // no signal
  new THREE.Color(0xffee44), // weak
  new THREE.Color(0xff8800), // moderate
  new THREE.Color(0xff2222), // strong
];

function lerpColor(c1, c2, t) {
  return new THREE.Color(
    c1.r + (c2.r - c1.r) * t,
    c1.g + (c2.g - c1.g) * t,
    c1.b + (c2.b - c1.b) * t,
  );
}

function signalColor(strength) {
  // 0–1 mapped through 4 colour stops
  const n = BEAM_COLORS.length - 1;
  const idx = Math.min(Math.floor(strength * n), n - 1);
  const frac = strength * n - idx;
  return lerpColor(BEAM_COLORS[idx], BEAM_COLORS[idx + 1], frac);
}

// ─── CSS injection ────────────────────────────────────────────────────────────

const STYLE_ID = 'surface-explorer-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ── Scan reticle ── */
    #scan-reticle {
      position: fixed;
      width: 56px;
      height: 56px;
      pointer-events: none;
      z-index: 100;
      transform: translate(-50%, -50%);
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    #scan-reticle.visible { opacity: 1; }
    #scan-reticle svg { width: 100%; height: 100%; }

    /* outer ring rotation */
    #scan-reticle .reticle-ring {
      transform-origin: 28px 28px;
      animation: reticle-spin 4s linear infinite;
    }
    @keyframes reticle-spin {
      to { transform: rotate(360deg); }
    }

    /* inner ring counter-rotation */
    #scan-reticle .reticle-ring-inner {
      transform-origin: 28px 28px;
      animation: reticle-spin-rev 6s linear infinite;
    }
    @keyframes reticle-spin-rev {
      to { transform: rotate(-360deg); }
    }

    /* ── Signal meter ── */
    #signal-meter {
      position: fixed;
      right: 28px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 160px;
      background: rgba(0,0,0,0.55);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 8px;
      overflow: hidden;
      z-index: 100;
      opacity: 0;
      transition: opacity 0.25s ease;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    #signal-meter.visible { opacity: 1; }
    #signal-meter-fill {
      width: 100%;
      height: 0%;
      border-radius: 8px;
      transition: height 0.08s linear, background 0.12s ease;
    }
    #signal-meter.pulse #signal-meter-fill {
      animation: meter-pulse 0.4s ease-in-out infinite alternate;
    }
    @keyframes meter-pulse {
      from { opacity: 0.6; }
      to   { opacity: 1.0; box-shadow: 0 0 10px currentColor; }
    }

    /* ── Signal meter label ── */
    #signal-label {
      position: fixed;
      right: 50px;
      top: 50%;
      transform: translateY(-50%);
      color: #aaa;
      font-family: 'JetBrains Mono', monospace, sans-serif;
      font-size: 10px;
      letter-spacing: 0.08em;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      z-index: 100;
      opacity: 0;
      transition: opacity 0.25s;
      user-select: none;
    }
    #signal-label.visible { opacity: 1; }

    /* ── Discovery popup ── */
    #discovery-popup {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: rgba(0,0,0,0.85);
      border: 1px solid #f59e0b;
      border-radius: 12px;
      padding: 14px 22px;
      color: #fff;
      font-family: 'Inter', sans-serif;
      z-index: 200;
      opacity: 0;
      transition: opacity 0.35s ease, transform 0.35s ease;
      pointer-events: none;
      max-width: 320px;
      text-align: center;
    }
    #discovery-popup.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    #discovery-popup h3 {
      margin: 0 0 4px;
      font-size: 15px;
      color: #fcd34d;
    }
    #discovery-popup p {
      margin: 0;
      font-size: 12px;
      color: #ccc;
      line-height: 1.4;
    }
    #discovery-popup .discovery-icon {
      font-size: 24px;
      margin-bottom: 6px;
    }

    /* ── Scan toggle button ── */
    #scan-toggle {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 24px;
      border-radius: 9999px;
      border: 2px solid rgba(255,255,255,0.25);
      background: rgba(0,0,0,0.6);
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      cursor: pointer;
      z-index: 100;
      user-select: none;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
      backdrop-filter: blur(6px);
    }
    #scan-toggle:hover {
      background: rgba(34,197,94,0.15);
      border-color: #22c55e;
      color: #4ade80;
    }
    #scan-toggle.scanning {
      background: rgba(245,158,11,0.2);
      border-color: #f59e0b;
      color: #fcd34d;
    }

    /* ── Discovery edge-flash ── */
    #discovery-flash {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 300;
      background: transparent;
      box-shadow: inset 0 0 0 0 rgba(253,224,71,0);
      transition: box-shadow 0.15s ease;
    }
    #discovery-flash.flash {
      box-shadow: inset 0 0 80px 20px rgba(253,224,71,0.65);
    }
  `;
  document.head.appendChild(style);
}

// ─── HTML element builders ────────────────────────────────────────────────────

function buildReticle() {
  const el = document.createElement('div');
  el.id = 'scan-reticle';
  el.innerHTML = `
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- outer dashed ring (rotates) -->
      <g class="reticle-ring">
        <circle cx="28" cy="28" r="24"
          stroke="rgba(255,200,50,0.85)" stroke-width="1.5"
          stroke-dasharray="6 4" />
      </g>
      <!-- inner ring (counter-rotates) -->
      <g class="reticle-ring-inner">
        <circle cx="28" cy="28" r="14"
          stroke="rgba(255,200,50,0.5)" stroke-width="1"
          stroke-dasharray="3 5" />
      </g>
      <!-- crosshair lines -->
      <line x1="28" y1="4"  x2="28" y2="18" stroke="rgba(255,200,50,0.9)" stroke-width="1.5" />
      <line x1="28" y1="38" x2="28" y2="52" stroke="rgba(255,200,50,0.9)" stroke-width="1.5" />
      <line x1="4"  y1="28" x2="18" y2="28" stroke="rgba(255,200,50,0.9)" stroke-width="1.5" />
      <line x1="38" y1="28" x2="52" y2="28" stroke="rgba(255,200,50,0.9)" stroke-width="1.5" />
      <!-- dot center -->
      <circle cx="28" cy="28" r="2" fill="rgba(255,200,50,0.95)" />
    </svg>`;
  return el;
}

function buildSignalMeter() {
  const wrap = document.createElement('div');
  wrap.id = 'signal-meter';
  const fill = document.createElement('div');
  fill.id = 'signal-meter-fill';
  wrap.appendChild(fill);
  return { meter: wrap, fill };
}

function buildSignalLabel() {
  const el = document.createElement('div');
  el.id = 'signal-label';
  el.textContent = 'SIGNAL';
  return el;
}

function buildDiscoveryPopup() {
  const el = document.createElement('div');
  el.id = 'discovery-popup';
  el.innerHTML = `
    <div class="discovery-icon">✨</div>
    <h3 id="discovery-name"></h3>
    <p id="discovery-desc"></p>`;
  return el;
}

function buildScanToggle() {
  const el = document.createElement('div');
  el.id = 'scan-toggle';
  el.textContent = '🔍 Scan';
  return el;
}

function buildFlash() {
  const el = document.createElement('div');
  el.id = 'discovery-flash';
  return el;
}

// ─── Particle burst ───────────────────────────────────────────────────────────

function createParticleBurst(scene, position, color) {
  const COUNT = 24;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3]     = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color,
    size: 0.3,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // Velocity for each particle
  const velocities = [];
  for (let i = 0; i < COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.random() * Math.PI;
    const speed = 0.05 + Math.random() * 0.15;
    velocities.push(new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.sin(phi) * Math.sin(theta) * speed,
      Math.cos(phi) * speed,
    ));
  }

  let age = 0;
  const LIFETIME = 1.2; // seconds

  // Returns true when alive, false when done
  function tick(delta) {
    age += delta;
    if (age > LIFETIME) {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
      return false;
    }

    const progress = age / LIFETIME;
    mat.opacity = 1.0 - progress;

    const pos = geo.attributes.position;
    for (let i = 0; i < COUNT; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + velocities[i].x,
        pos.getY(i) + velocities[i].y,
        pos.getZ(i) + velocities[i].z,
      );
    }
    pos.needsUpdate = true;
    return true;
  }

  return { tick };
}

// ─── Scan beam ────────────────────────────────────────────────────────────────

function createScanBeam(scene) {
  // Core beam line
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0,0,0, 0,0,0]), 3),
  );
  const coreMat = new THREE.LineBasicMaterial({
    color: 0x2266ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    linewidth: 1, // note: linewidth > 1 only works in WebGL1 on some drivers
  });
  const coreLine = new THREE.Line(coreGeo, coreMat);
  coreLine.visible = false;
  scene.add(coreLine);

  // Glow beam line (slightly thicker, transparent duplicate)
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0,0,0, 0,0,0]), 3),
  );
  const glowMat = new THREE.LineBasicMaterial({
    color: 0x2266ff,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    linewidth: 2,
    blending: THREE.AdditiveBlending,
  });
  const glowLine = new THREE.Line(glowGeo, glowMat);
  glowLine.visible = false;
  scene.add(glowLine);

  function setPoints(from, to) {
    const pts = new Float32Array([
      from.x, from.y, from.z,
      to.x,   to.y,   to.z,
    ]);
    coreGeo.setAttribute('position', new THREE.BufferAttribute(pts.slice(), 3));
    glowGeo.setAttribute('position', new THREE.BufferAttribute(pts.slice(), 3));
    coreGeo.attributes.position.needsUpdate = true;
    glowGeo.attributes.position.needsUpdate = true;
    coreLine.geometry.computeBoundingSphere();
    glowLine.geometry.computeBoundingSphere();
  }

  function setColor(color) {
    coreMat.color.copy(color);
    glowMat.color.copy(color);
  }

  function setVisible(v) {
    coreLine.visible = v;
    glowLine.visible = v;
  }

  function dispose() {
    scene.remove(coreLine);
    scene.remove(glowLine);
    coreGeo.dispose();
    glowGeo.dispose();
    coreMat.dispose();
    glowMat.dispose();
  }

  return { setPoints, setColor, setVisible, dispose };
}

// ─── POI marker ───────────────────────────────────────────────────────────────

function createPoiMarker(scene, position, color) {
  const geo = new THREE.SphereGeometry(0.18, 12, 12);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  scene.add(mesh);

  // Outer pulse ring
  const ringGeo = new THREE.RingGeometry(0.22, 0.32, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(position);
  // Orient ring to face camera (will be updated each frame via lookAt)
  scene.add(ring);

  let discovered = false;
  let pulseTime = 0;

  function update(time, camera, delta) {
    pulseTime += delta;
    if (!discovered) {
      // Yellow pulsing
      const pulse = Math.sin(pulseTime * 3.0) * 0.5 + 0.5;
      mat.opacity = 0.6 + pulse * 0.4;
      ringMat.opacity = 0.2 + pulse * 0.35;
      ring.scale.setScalar(1.0 + pulse * 0.4);
    } else {
      // Green steady
      mat.color.set(0x22c55e);
      mat.opacity = 0.95;
      ringMat.color.set(0x22c55e);
      ringMat.opacity = 0.4;
      ring.scale.setScalar(1.0);
    }
    // Keep ring facing camera
    ring.lookAt(camera.position);
  }

  function markDiscovered() {
    discovered = true;
  }

  function dispose() {
    scene.remove(mesh);
    scene.remove(ring);
    geo.dispose();
    mat.dispose();
    ringGeo.dispose();
    ringMat.dispose();
  }

  return { mesh, ring, update, markDiscovered, dispose };
}

// ─── createSurfaceExplorer ────────────────────────────────────────────────────

export function createSurfaceExplorer(camera, renderer) {
  // Orbit state
  let azimuth        = 0;
  let elevation      = 0.3;
  let targetAzimuth  = 0;
  let targetElevation = 0.3;
  let distance       = DEFAULT_DIST;
  let targetDistance = DEFAULT_DIST;

  // Momentum (velocity in radians/frame)
  let velAz  = 0;
  let velEl  = 0;

  // Drag tracking
  let isDragging    = false;
  let lastPointerX  = 0;
  let lastPointerY  = 0;
  let lastDx        = 0;
  let lastDy        = 0;

  // Pinch/zoom tracking (two-finger)
  let lastPinchDist = null;

  // Internal scene references
  let terrainGroup  = null;
  let active        = false;
  let scanEnabled   = false;

  // Mouse NDC for scanning
  const mouseNDC = new THREE.Vector2(0, 0);

  // POI markers (Three.js objects wrapping each POI in the terrain)
  const poiMarkers = [];

  // Active particle bursts
  const bursts = [];

  // Discovery callback
  let onDiscoverCb = null;

  // HTML elements (created in enter, removed in exit)
  let elReticle     = null;
  let elMeter       = null;
  let elMeterFill   = null;
  let elLabel       = null;
  let elPopup       = null;
  let elToggle      = null;
  let elFlash       = null;

  // THREE objects (created lazily, cleaned up in exit)
  let scanBeam      = null;
  let raycaster     = null;
  let scene         = null; // set from terrainGroup.parent in enter()

  // Popup auto-hide timer
  let popupTimer    = null;

  // ── Pointer event handlers ──────────────────────────────────────────────────

  function onPointerDown(e) {
    if (!active) return;

    // Ignore events that land on HUD buttons (scan toggle, back, etc.)
    if (e.target !== renderer.domElement) return;

    isDragging   = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    lastDx = lastDy = 0;
  }

  function onPointerMove(e) {
    if (!active) return;

    // Always track NDC for scan reticle
    mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

    // Move reticle HTML element to cursor
    if (elReticle && scanEnabled) {
      elReticle.style.left = `${e.clientX}px`;
      elReticle.style.top  = `${e.clientY}px`;
    }

    if (!isDragging) return;

    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastDx = dx;
    lastDy = dy;

    // Sensitivity scales with distance so close-in moves feel right
    const sensitivity = 0.003 * (distance / DEFAULT_DIST);

    targetAzimuth   -= dx * sensitivity;
    targetElevation += dy * sensitivity;
    targetElevation  = Math.max(ELEVATION_MIN, Math.min(ELEVATION_MAX, targetElevation));

    // Rolling average momentum
    velAz = dx * sensitivity * -0.7;
    velEl = dy * sensitivity *  0.7;

    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  }

  function onPointerUp(e) {
    if (!active || !isDragging) return;
    isDragging = false;
  }

  function onPointerCancel(e) {
    isDragging = false;
    lastPinchDist = null;
  }

  function onTouchStart(e) {
    if (!active) return;
    if (e.touches.length === 2) {
      isDragging = false; // switch to pinch mode
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function onTouchMove(e) {
    if (!active) return;
    if (e.touches.length === 2 && lastPinchDist !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = lastPinchDist - dist; // positive = pinch in = zoom in
      targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, targetDistance + delta * 0.1));
      lastPinchDist = dist;
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length < 2) lastPinchDist = null;
  }

  function onWheel(e) {
    if (!active) return;
    const delta = e.deltaY * 0.04;
    targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, targetDistance + delta));
  }

  // Click-to-discover when scanning
  function onClickScan(e) {
    if (!active || !scanEnabled) return;
    if (e.target !== renderer.domElement) return;
    if (!terrainGroup || !terrainGroup.pois) return;

    // Raycast against terrain
    raycaster.setFromCamera(mouseNDC, camera);
    const meshes = [];
    terrainGroup.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
    const hits = raycaster.intersectObjects(meshes, true);
    if (!hits.length) return;

    const surfacePoint = hits[0].point;

    // Find closest undiscovered POI within discover range
    let closestPoi    = null;
    let closestMarker = null;
    let closestDist   = Infinity;

    for (let i = 0; i < (terrainGroup.pois || []).length; i++) {
      const poi    = terrainGroup.pois[i];
      const marker = poiMarkers[i];
      if (poi.discovered) continue;

      const d = surfacePoint.distanceTo(marker.mesh.position);
      if (d < closestDist) {
        closestDist   = d;
        closestPoi    = poi;
        closestMarker = marker;
      }
    }

    if (closestPoi && closestDist < DISCOVER_RADIUS) {
      discoverPoi(closestPoi, closestMarker);
    }
  }

  // ── Signal strength calculation ─────────────────────────────────────────────

  function getSignalStrength(surfacePoint) {
    if (!terrainGroup || !terrainGroup.pois) return 0;

    let minDist = Infinity;
    for (let i = 0; i < terrainGroup.pois.length; i++) {
      const poi    = terrainGroup.pois[i];
      const marker = poiMarkers[i];
      if (poi.discovered) continue;

      const d = surfacePoint.distanceTo(marker.mesh.position);
      if (d < minDist) minDist = d;
    }

    if (minDist >= SIGNAL_RADIUS) return 0;

    // Inverse linear — closer = stronger
    return 1.0 - (minDist / SIGNAL_RADIUS);
  }

  // ── Discovery effect ────────────────────────────────────────────────────────

  function discoverPoi(poi, marker) {
    poi.discovered = true;
    marker.markDiscovered();

    // Particle burst at POI world position
    if (scene) {
      const burst = createParticleBurst(scene, marker.mesh.position, 0xfcd34d);
      bursts.push(burst);
    }

    // Edge flash
    triggerFlash();

    // Popup
    showPopup(poi);

    // Fire callback
    if (onDiscoverCb) onDiscoverCb(poi);
  }

  function triggerFlash() {
    if (!elFlash) return;
    elFlash.classList.add('flash');
    setTimeout(() => elFlash.classList.remove('flash'), 350);
  }

  function showPopup(poi) {
    if (!elPopup) return;
    document.getElementById('discovery-name').textContent = poi.name || 'Discovery';
    document.getElementById('discovery-desc').textContent = poi.desc || '';
    elPopup.classList.add('visible');

    clearTimeout(popupTimer);
    popupTimer = setTimeout(() => {
      elPopup.classList.remove('visible');
    }, 4000);
  }

  // ── Bind / unbind DOM events ────────────────────────────────────────────────

  function bindEvents() {
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown',   onPointerDown);
    window.addEventListener('pointermove',   onPointerMove);
    window.addEventListener('pointerup',     onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('touchstart',    onTouchStart, { passive: true });
    canvas.addEventListener('touchmove',     onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',      onTouchEnd,   { passive: true });
    canvas.addEventListener('wheel',         onWheel,      { passive: true });
    canvas.addEventListener('click',         onClickScan);
  }

  function unbindEvents() {
    const canvas = renderer.domElement;
    canvas.removeEventListener('pointerdown',   onPointerDown);
    window.removeEventListener('pointermove',   onPointerMove);
    window.removeEventListener('pointerup',     onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('touchstart',    onTouchStart);
    canvas.removeEventListener('touchmove',     onTouchMove);
    canvas.removeEventListener('touchend',      onTouchEnd);
    canvas.removeEventListener('wheel',         onWheel);
    canvas.removeEventListener('click',         onClickScan);
  }

  // ── Build/remove HUD ────────────────────────────────────────────────────────

  function buildHUD() {
    injectStyles();

    elReticle = buildReticle();
    document.body.appendChild(elReticle);

    const { meter, fill } = buildSignalMeter();
    elMeter     = meter;
    elMeterFill = fill;
    document.body.appendChild(elMeter);

    elLabel = buildSignalLabel();
    document.body.appendChild(elLabel);

    elPopup = buildDiscoveryPopup();
    document.body.appendChild(elPopup);

    elToggle = buildScanToggle();
    document.body.appendChild(elToggle);

    elFlash = buildFlash();
    document.body.appendChild(elFlash);

    elToggle.addEventListener('click', () => {
      if (scanEnabled) {
        disableScan();
      } else {
        enableScan();
      }
    });
  }

  function removeHUD() {
    [elReticle, elMeter, elLabel, elPopup, elToggle, elFlash].forEach(el => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    elReticle = elMeter = elMeterFill = elLabel = elPopup = elToggle = elFlash = null;
  }

  // ── Build/remove POI markers ────────────────────────────────────────────────

  function buildPoiMarkers() {
    if (!terrainGroup || !terrainGroup.pois) return;
    const sc = terrainGroup.parent || scene;
    if (!sc) return;

    for (const poi of terrainGroup.pois) {
      const pos   = poi.position instanceof THREE.Vector3
        ? poi.position.clone()
        : new THREE.Vector3(poi.position.x, poi.position.y, poi.position.z);
      const color = poi.color || 0xfbbf24;
      const m     = createPoiMarker(sc, pos, color);
      poiMarkers.push(m);
    }
  }

  function removePoiMarkers() {
    for (const m of poiMarkers) m.dispose();
    poiMarkers.length = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Enter surface exploration mode.
   * @param {THREE.Group} tGroup — terrain group from the caller. Should have:
   *   tGroup.pois = [{ name, desc, position: {x,y,z}, color?, discovered? }]
   */
  function enter(tGroup) {
    if (active) return;
    active       = true;
    terrainGroup = tGroup;
    scanEnabled  = false;

    // Grab the scene from the terrain group's parent
    scene = null;
    let node = tGroup;
    while (node.parent) {
      node  = node.parent;
      if (node.isScene) { scene = node; break; }
    }

    // Initialise orbit camera to a nice overview
    azimuth         = 0;
    elevation       = 0.3;
    targetAzimuth   = 0;
    targetElevation = 0.3;
    distance        = DEFAULT_DIST;
    targetDistance  = DEFAULT_DIST;
    velAz = velEl   = 0;

    // Snap camera into position immediately so there's no first-frame jump
    updateCameraPosition();

    raycaster = new THREE.Raycaster();

    // Create scan beam in the scene
    if (scene) {
      scanBeam = createScanBeam(scene);
    }

    // Build HTML overlays
    buildHUD();

    // Build Three.js POI markers
    buildPoiMarkers();

    // Bind input events
    bindEvents();
  }

  function exit() {
    if (!active) return;
    active      = false;
    scanEnabled = false;

    unbindEvents();
    removeHUD();
    removePoiMarkers();

    if (scanBeam) {
      scanBeam.dispose();
      scanBeam = null;
    }

    terrainGroup = null;
    raycaster    = null;
    scene        = null;
    clearTimeout(popupTimer);
  }

  function enableScan() {
    if (!active) return;
    scanEnabled = true;
    if (elReticle)  elReticle.classList.add('visible');
    if (elMeter)    elMeter.classList.add('visible');
    if (elLabel)    elLabel.classList.add('visible');
    if (scanBeam)   scanBeam.setVisible(true);
    if (elToggle) {
      elToggle.classList.add('scanning');
      elToggle.textContent = '🔍 Scanning…';
    }
  }

  function disableScan() {
    if (!active) return;
    scanEnabled = false;
    if (elReticle)  elReticle.classList.remove('visible');
    if (elMeter)    elMeter.classList.remove('visible');
    if (elLabel)    elLabel.classList.remove('visible');
    if (scanBeam)   scanBeam.setVisible(false);
    if (elToggle) {
      elToggle.classList.remove('scanning');
      elToggle.textContent = '🔍 Scan';
    }
  }

  function isActive() {
    return active;
  }

  function onDiscover(callback) {
    onDiscoverCb = callback;
  }

  // ── Camera position helper ───────────────────────────────────────────────────

  function updateCameraPosition() {
    camera.position.x = distance * Math.cos(elevation) * Math.sin(azimuth);
    camera.position.y = distance * Math.sin(elevation);
    camera.position.z = distance * Math.cos(elevation) * Math.cos(azimuth);
    camera.lookAt(0, 0, 0);
  }

  // ── Per-frame update ────────────────────────────────────────────────────────

  function update(time, delta) {
    if (!active) return;

    // ── 1. Orbit camera ───────────────────────────────────────────────────────

    // When not dragging, apply momentum + friction
    if (!isDragging) {
      velAz  *= FRICTION;
      velEl  *= FRICTION;
      targetAzimuth   += velAz;
      targetElevation += velEl;
      targetElevation  = Math.max(ELEVATION_MIN, Math.min(ELEVATION_MAX, targetElevation));
    }

    // Smooth damp toward targets
    azimuth   += (targetAzimuth   - azimuth)   * DAMPING;
    elevation += (targetElevation - elevation) * DAMPING;
    distance  += (targetDistance  - distance)  * DAMPING;

    updateCameraPosition();

    // ── 2. Update POI markers ─────────────────────────────────────────────────

    for (const m of poiMarkers) {
      m.update(time, camera, delta);
    }

    // ── 3. Update particle bursts ─────────────────────────────────────────────

    for (let i = bursts.length - 1; i >= 0; i--) {
      const alive = bursts[i].tick(delta);
      if (!alive) bursts.splice(i, 1);
    }

    // ── 4. Scan beam + signal meter ───────────────────────────────────────────

    if (!scanEnabled || !raycaster || !terrainGroup) return;

    raycaster.setFromCamera(mouseNDC, camera);

    const meshes = [];
    terrainGroup.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
    const hits = raycaster.intersectObjects(meshes, true);

    if (!hits.length) {
      if (scanBeam) scanBeam.setVisible(false);
      setMeterStrength(0, time);
      return;
    }

    scanBeam.setVisible(true);

    const surfacePoint  = hits[0].point;
    const strength      = getSignalStrength(surfacePoint);
    const beamColor     = signalColor(strength);

    // Update beam endpoints: camera position → surface hit
    scanBeam.setPoints(camera.position, surfacePoint);
    scanBeam.setColor(beamColor);

    // Update reticle color based on signal
    if (elReticle) {
      const svgCircles = elReticle.querySelectorAll('circle, line');
      const hexStr = '#' + beamColor.getHexString();
      svgCircles.forEach(el => {
        const attr = el.tagName === 'circle' ? 'stroke' : 'stroke';
        // For the fill dot (last circle) keep fill
        if (el.tagName === 'circle' && el.getAttribute('fill')) {
          el.setAttribute('fill', hexStr);
        }
        if (el.getAttribute('stroke')) {
          el.setAttribute('stroke', hexStr.replace('#', 'rgba(').replace(')', ',0.85)'));
        }
      });
    }

    // Update signal meter
    setMeterStrength(strength, time);
  }

  function setMeterStrength(strength, time) {
    if (!elMeterFill || !elMeter) return;

    const pct = Math.round(strength * 100);
    elMeterFill.style.height = `${pct}%`;

    // Color the fill based on strength
    let fillColor;
    if (strength < 0.001) {
      fillColor = 'transparent';
    } else if (strength < 0.35) {
      fillColor = '#eab308'; // yellow
    } else if (strength < 0.70) {
      fillColor = '#f97316'; // orange
    } else {
      fillColor = '#ef4444'; // red
    }
    elMeterFill.style.background = fillColor;

    // Pulse when strong
    if (strength > 0.70) {
      elMeter.classList.add('pulse');
    } else {
      elMeter.classList.remove('pulse');
    }
  }

  // ── Return public API ────────────────────────────────────────────────────────

  return {
    enter,
    exit,
    enableScan,
    disableScan,
    update,
    isActive,
    onDiscover,
  };
}
