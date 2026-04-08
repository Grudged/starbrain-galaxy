import * as THREE from 'three';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Uniform random float in [min, max) */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Build a 64x64 CanvasTexture with a soft radial glow.
 * The center is white-hot, fading through `hexColor` to transparent.
 */
function makeGlowTexture(hexColor, size = 64) {
  const canvas  = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx     = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2;

  // Decompose hex number into r,g,b strings
  const rc = (hexColor >> 16) & 0xff;
  const gc = (hexColor >>  8) & 0xff;
  const bc =  hexColor        & 0xff;
  const mid = `rgba(${rc},${gc},${bc},`;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0.00, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.12, `${mid}0.95)`);
  grad.addColorStop(0.35, `${mid}0.55)`);
  grad.addColorStop(0.65, `${mid}0.15)`);
  grad.addColorStop(1.00, 'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

/**
 * Build a wide, very dim glow texture — used for the large outer corona halo.
 * No white-hot core; just a translucent tinted wash.
 */
function makeHaloTexture(hexColor, size = 128) {
  const canvas  = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx     = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2;

  const rc = (hexColor >> 16) & 0xff;
  const gc = (hexColor >>  8) & 0xff;
  const bc =  hexColor        & 0xff;
  const mid = `rgba(${rc},${gc},${bc},`;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0.00, `${mid}0.35)`);
  grad.addColorStop(0.30, `${mid}0.18)`);
  grad.addColorStop(0.70, `${mid}0.05)`);
  grad.addColorStop(1.00, 'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

/**
 * Build a thin elongated streak texture for corona rays.
 * The streak is brightest at center and fades to nothing at both ends.
 */
function makeStreakTexture(hexColor) {
  const W = 128;
  const H = 16;
  const canvas  = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx     = canvas.getContext('2d');

  const rc = (hexColor >> 16) & 0xff;
  const gc = (hexColor >>  8) & 0xff;
  const bc =  hexColor        & 0xff;

  // Horizontal gradient across the length of the streak
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0.00, 'rgba(0,0,0,0)');
  grad.addColorStop(0.40, `rgba(${rc},${gc},${bc},0.10)`);
  grad.addColorStop(0.50, `rgba(${rc},${gc},${bc},0.50)`);
  grad.addColorStop(0.60, `rgba(${rc},${gc},${bc},0.10)`);
  grad.addColorStop(1.00, 'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  return new THREE.CanvasTexture(canvas);
}

// ── createSystemMarker ─────────────────────────────────────────────────────

/**
 * Creates the distant galaxy-view icon for a star system.
 *
 * Returns { group, update(time) }.
 *   group      — THREE.Group containing the sprite; add to galaxy scene.
 *   update(t)  — call every frame with elapsed seconds to animate pulse.
 */
export function createSystemMarker(systemData) {
  const group = new THREE.Group();

  const { galaxyPos, starColor } = systemData;
  group.position.set(galaxyPos.x, galaxyPos.y, galaxyPos.z);

  // --- Glow sprite ---------------------------------------------------------

  const glowTex  = makeGlowTexture(starColor);
  const glowMat  = new THREE.SpriteMaterial({
    map:         glowTex,
    color:       new THREE.Color(starColor),
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(glowMat);
  sprite.scale.setScalar(1.5);
  group.add(sprite);

  // --- Store system data for raycasting ------------------------------------

  group.userData = { system: systemData };
  sprite.userData = { system: systemData };

  // --- Per-system pulse offset so all 6 stars don't pulse in sync ----------
  const pulseOffset = Math.random() * Math.PI * 2;

  // ── update ────────────────────────────────────────────────────────────────

  function update(time) {
    // 0.5 Hz pulse: scale oscillates 0.95 → 1.05
    const s = 1.0 + 0.05 * Math.sin(time * Math.PI + pulseOffset); // π rad/s = 0.5 Hz
    sprite.scale.setScalar(1.5 * s);
  }

  return { group, update };
}

// ── createSystemScene ──────────────────────────────────────────────────────

/**
 * Creates the full close-up system view seen when the camera is zoomed in.
 *
 * @param {object} systemData  — entry from SYSTEMS array (starColor, etc.)
 * @param {THREE.Group} planet — already-built planet group from PlanetBuilder
 *
 * Returns { group, update(time), getPlanetWorldPos() }.
 *   group             — THREE.Group; add to scene (or swap with galaxy view).
 *   update(t)         — call every frame with elapsed seconds.
 *   getPlanetWorldPos — returns THREE.Vector3 of planet's current world pos.
 */
export function createSystemScene(systemData, planet) {
  const group = new THREE.Group();

  const { starColor } = systemData;
  const color = new THREE.Color(starColor);

  // ── 1. Central star ───────────────────────────────────────────────────────

  const starGeo = new THREE.SphereGeometry(0.8, 32, 32);
  const starMat = new THREE.MeshBasicMaterial({ color });
  const starMesh = new THREE.Mesh(starGeo, starMat);
  group.add(starMesh);

  // Point light — illuminates the planet from the star position
  const starLight = new THREE.PointLight(color, 2, 20);
  starLight.position.set(0, 0, 0);
  group.add(starLight);

  // ── 2. Star glow halo (large outer sprite) ────────────────────────────────

  const haloTex = makeHaloTexture(starColor, 128);
  const haloMat = new THREE.SpriteMaterial({
    map:         haloTex,
    color,
    transparent: true,
    opacity:     0.85,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.scale.setScalar(4.0);
  group.add(haloSprite);

  // Inner tight glow (same technique, smaller, brighter)
  const innerGlowTex = makeGlowTexture(starColor, 64);
  const innerGlowMat = new THREE.SpriteMaterial({
    map:         innerGlowTex,
    color,
    transparent: true,
    opacity:     0.9,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });
  const innerGlowSprite = new THREE.Sprite(innerGlowMat);
  innerGlowSprite.scale.setScalar(2.0);
  group.add(innerGlowSprite);

  // ── 3. Corona rays (lens-flare style streaks) ─────────────────────────────

  const CORONA_COUNT = 5;
  const coronaSprites = [];
  const streakTex = makeStreakTexture(starColor);

  for (let i = 0; i < CORONA_COUNT; i++) {
    const angle  = (i / CORONA_COUNT) * Math.PI; // 0..π, then reused with scaleY flip
    const length = rand(1.8, 3.2);
    const width  = rand(0.08, 0.18);

    const mat = new THREE.SpriteMaterial({
      map:         streakTex,
      color,
      transparent: true,
      opacity:     rand(0.25, 0.5),
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      rotation:    angle,
    });

    const streak = new THREE.Sprite(mat);
    streak.scale.set(length, width, 1);
    group.add(streak);
    coronaSprites.push({ streak, mat, baseOpacity: mat.opacity, phase: rand(0, Math.PI * 2) });
  }

  // ── 4. Planet orbit ring ──────────────────────────────────────────────────

  const ORBIT_RADIUS = 5.0;
  const ringGeo = new THREE.RingGeometry(4.8, 5.0, 128);
  const ringMat = new THREE.MeshBasicMaterial({
    color:       0xffffff,
    transparent: true,
    opacity:     0.12,
    side:        THREE.DoubleSide,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  // Lay flat on XZ plane
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  // ── 5. Planet — position on orbit ring ───────────────────────────────────

  // The planet group is passed in already built. We wrap it in a pivot
  // object so orbiting is just rotating the pivot around Y.
  const orbitPivot = new THREE.Group();
  group.add(orbitPivot);

  planet.position.set(ORBIT_RADIUS, 0, 0);
  orbitPivot.add(planet);

  // ── 6. Particle dust disc ─────────────────────────────────────────────────

  const DUST_COUNT = 260;
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustColors    = new Float32Array(DUST_COUNT * 3);
  const dustSizes     = new Float32Array(DUST_COUNT);

  // Pull r/g/b components out of the star color for dust tinting
  const dustR = ((starColor >> 16) & 0xff) / 255;
  const dustG = ((starColor >>  8) & 0xff) / 255;
  const dustB = ( starColor        & 0xff) / 255;

  for (let i = 0; i < DUST_COUNT; i++) {
    const radius = rand(3.0, 8.0);
    const angle  = rand(0, Math.PI * 2);
    const height = rand(-0.25, 0.25); // thin disc

    dustPositions[i * 3]     = Math.cos(angle) * radius;
    dustPositions[i * 3 + 1] = height;
    dustPositions[i * 3 + 2] = Math.sin(angle) * radius;

    // Mix between white-ish and star color for variety
    const blend = rand(0.2, 0.7);
    const bri   = rand(0.5, 1.0);
    dustColors[i * 3]     = (dustR * blend + (1 - blend)) * bri;
    dustColors[i * 3 + 1] = (dustG * blend + (1 - blend)) * bri;
    dustColors[i * 3 + 2] = (dustB * blend + (1 - blend)) * bri;

    dustSizes[i] = rand(0.05, 0.15);
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeo.setAttribute('color',    new THREE.BufferAttribute(dustColors, 3));

  const dustMat = new THREE.PointsMaterial({
    size:            0.10,
    sizeAttenuation: true,
    vertexColors:    true,
    transparent:     true,
    opacity:         0.55,
    depthWrite:      false,
    blending:        THREE.AdditiveBlending,
  });

  const dustPoints = new THREE.Points(dustGeo, dustMat);
  group.add(dustPoints);

  // Store per-particle orbital speed (inner = faster, outer = slower — Kepler-ish)
  const dustAngles = new Float32Array(DUST_COUNT);
  const dustRadii  = new Float32Array(DUST_COUNT);
  const dustHeights = new Float32Array(DUST_COUNT);
  const dustOrbitalSpeeds = new Float32Array(DUST_COUNT);

  for (let i = 0; i < DUST_COUNT; i++) {
    dustAngles[i]         = Math.atan2(dustPositions[i * 3 + 2], dustPositions[i * 3]);
    dustRadii[i]          = Math.sqrt(dustPositions[i * 3] ** 2 + dustPositions[i * 3 + 2] ** 2);
    dustHeights[i]        = dustPositions[i * 3 + 1];
    // Kepler-ish: speed ∝ 1/√r — dust near star moves faster
    dustOrbitalSpeeds[i]  = 0.04 / Math.sqrt(dustRadii[i]);
  }

  const dustPosAttr = dustGeo.attributes.position;

  // ── Reusable world-position vector ────────────────────────────────────────

  const _planetWorldPos = new THREE.Vector3();

  // ── update ────────────────────────────────────────────────────────────────

  function update(time) {
    // --- Planet orbit -------------------------------------------------------
    // 0.05 rad/s
    orbitPivot.rotation.y = time * 0.05;

    // --- Corona flicker -----------------------------------------------------
    for (const { mat, baseOpacity, phase } of coronaSprites) {
      mat.opacity = baseOpacity * (0.75 + 0.25 * Math.sin(time * 1.8 + phase));
    }

    // --- Halo gentle pulse --------------------------------------------------
    const haloPulse = 1.0 + 0.08 * Math.sin(time * 0.7);
    haloSprite.scale.setScalar(4.0 * haloPulse);
    innerGlowSprite.scale.setScalar(2.0 * (1.0 + 0.05 * Math.sin(time * 1.1)));

    // --- Dust orbital rotation ----------------------------------------------
    for (let i = 0; i < DUST_COUNT; i++) {
      dustAngles[i] += dustOrbitalSpeeds[i] * 0.016; // ~60 fps delta approximation
      dustPosAttr.array[i * 3]     = Math.cos(dustAngles[i]) * dustRadii[i];
      dustPosAttr.array[i * 3 + 1] = dustHeights[i];
      dustPosAttr.array[i * 3 + 2] = Math.sin(dustAngles[i]) * dustRadii[i];
    }
    dustPosAttr.needsUpdate = true;
  }

  // ── getPlanetWorldPos ──────────────────────────────────────────────────────

  function getPlanetWorldPos() {
    planet.getWorldPosition(_planetWorldPos);
    return _planetWorldPos;
  }

  return { group, update, getPlanetWorldPos };
}
