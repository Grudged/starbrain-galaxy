import * as THREE from 'three';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Uniform random float in [min, max) */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

/** Random point on the surface of a sphere of given radius */
function randomOnSphere(radius) {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi)
  );
}

// ── createStarfield ────────────────────────────────────────────────────────

export function createStarfield(scene) {
  const STAR_COUNT = 8000;
  const RADIUS = 200;

  // --- Primary star field ---------------------------------------------------

  const positions = new Float32Array(STAR_COUNT * 3);
  const colors    = new Float32Array(STAR_COUNT * 3);
  const sizes     = new Float32Array(STAR_COUNT);

  // Indices of the ~20% of stars that will twinkle
  const twinkleCount = Math.floor(STAR_COUNT * 0.2);
  const twinkleIdx   = new Uint16Array(twinkleCount);

  // Tint palette: slightly warm/cool whites to give depth
  const TINTS = [
    [1.00, 1.00, 1.00], // pure white
    [0.85, 0.90, 1.00], // pale blue
    [0.90, 0.95, 1.00], // blue-white
    [1.00, 0.97, 0.88], // warm yellow
    [1.00, 0.93, 0.85], // pale gold
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
    const p = randomOnSphere(rand(80, RADIUS));
    positions[i * 3]     = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    const tint       = TINTS[Math.floor(Math.random() * TINTS.length)];
    const brightness = rand(0.55, 1.0);
    colors[i * 3]     = tint[0] * brightness;
    colors[i * 3 + 1] = tint[1] * brightness;
    colors[i * 3 + 2] = tint[2] * brightness;

    sizes[i] = rand(0.3, 2.0);
  }

  // Pick twinkle indices randomly
  const shuffled = Array.from({ length: STAR_COUNT }, (_, k) => k);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i < twinkleCount; i++) twinkleIdx[i] = shuffled[i];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes,     1));

  const mat = new THREE.PointsMaterial({
    size: 1.0,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // Custom size per-vertex requires a shader unless we rely on a uniform size.
  // THREE.PointsMaterial supports a per-vertex 'size' attribute only via
  // onBeforeCompile or ShaderMaterial. We'll handle it with a lightweight
  // shader injection so we stay performant.
  mat.onBeforeCompile = (shader) => {
    // Inject per-vertex size attribute and replace the uniform-size line
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'attribute float size;\nvoid main() {'
      )
      .replace(
        // Three.js r150+ writes: gl_PointSize = size; after computing mvPosition
        // For all versions the pattern is the final gl_PointSize assignment
        /gl_PointSize\s*=\s*[^;]+;/,
        'gl_PointSize = size;'
      );
    mat.userData.shader = shader;
  };

  const stars = new THREE.Points(geo, mat);
  stars.renderOrder = -2;
  scene.add(stars);

  // --- Feature stars (200 brighter, colored) --------------------------------

  const FEAT_COUNT = 200;
  const FEAT_COLORS = [
    [0.70, 0.85, 1.00], // pale blue
    [1.00, 0.95, 0.60], // gold
    [1.00, 0.75, 0.85], // pink
    [0.80, 1.00, 0.90], // mint
    [0.90, 0.80, 1.00], // lavender
  ];

  const fPositions = new Float32Array(FEAT_COUNT * 3);
  const fColors    = new Float32Array(FEAT_COUNT * 3);
  const fSizes     = new Float32Array(FEAT_COUNT);

  for (let i = 0; i < FEAT_COUNT; i++) {
    const p = randomOnSphere(rand(60, RADIUS * 0.9));
    fPositions[i * 3]     = p.x;
    fPositions[i * 3 + 1] = p.y;
    fPositions[i * 3 + 2] = p.z;

    const c = FEAT_COLORS[Math.floor(Math.random() * FEAT_COLORS.length)];
    fColors[i * 3]     = c[0];
    fColors[i * 3 + 1] = c[1];
    fColors[i * 3 + 2] = c[2];

    fSizes[i] = rand(2.5, 5.0);
  }

  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPositions, 3));
  fGeo.setAttribute('color',    new THREE.BufferAttribute(fColors,    3));
  fGeo.setAttribute('size',     new THREE.BufferAttribute(fSizes,     1));

  const fMat = new THREE.PointsMaterial({
    size: 3.5,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  fMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'attribute float size;\nvoid main() {'
      )
      .replace(
        /gl_PointSize\s*=\s*[^;]+;/,
        'gl_PointSize = size;'
      );
    fMat.userData.shader = shader;
  };

  const featureStars = new THREE.Points(fGeo, fMat);
  featureStars.renderOrder = -1;
  scene.add(featureStars);

  // --- Per-star twinkle state -----------------------------------------------

  // Each twinkle star has a random phase and speed
  const twinklePhase = new Float32Array(twinkleCount);
  const twinkleSpeed = new Float32Array(twinkleCount);
  for (let i = 0; i < twinkleCount; i++) {
    twinklePhase[i] = rand(0, Math.PI * 2);
    twinkleSpeed[i] = rand(0.8, 2.5);
  }

  // Cache the color attr reference for mutation in update()
  const colorAttr = geo.attributes.color;
  // Store baseline brightness per twinkle star
  const baseColors = new Float32Array(twinkleCount * 3);
  for (let i = 0; i < twinkleCount; i++) {
    const si = twinkleIdx[i];
    baseColors[i * 3]     = colors[si * 3];
    baseColors[i * 3 + 1] = colors[si * 3 + 1];
    baseColors[i * 3 + 2] = colors[si * 3 + 2];
  }

  // ── update ────────────────────────────────────────────────────────────────

  function update(time) {
    // Animate twinkle stars by modulating their brightness
    for (let i = 0; i < twinkleCount; i++) {
      const si     = twinkleIdx[i];
      const factor = 0.55 + 0.45 * Math.sin(time * twinkleSpeed[i] + twinklePhase[i]);

      colorAttr.array[si * 3]     = baseColors[i * 3]     * factor;
      colorAttr.array[si * 3 + 1] = baseColors[i * 3 + 1] * factor;
      colorAttr.array[si * 3 + 2] = baseColors[i * 3 + 2] * factor;
    }
    colorAttr.needsUpdate = true;
  }

  return { update };
}

// ── createNebula ───────────────────────────────────────────────────────────

/** Build a soft radial-gradient CanvasTexture for a nebula blob */
function makeNebulaTexture(innerColor, outerColor, size = 256) {
  const canvas  = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx     = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0,    innerColor);
  grad.addColorStop(0.35, innerColor.replace(/[\d.]+\)$/, '0.18)'));
  grad.addColorStop(0.70, outerColor.replace(/[\d.]+\)$/, '0.08)'));
  grad.addColorStop(1,    'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

export function createNebula(scene) {
  // Define nebula configs: color as rgba strings, position, scale, z-depth
  const NEBULAE = [
    {
      // Deep purple — upper-left background
      inner:    'rgba(100, 40, 180, 0.30)',
      outer:    'rgba(60,  20, 120, 0.10)',
      pos:      new THREE.Vector3(-60,  30, -90),
      scale:    110,
      rotSpeed: 0.008,
      baseOp:   0.18,
      pulseAmp: 0.06,
      pulseFreq: 0.40,
      phase:    0.0,
    },
    {
      // Blue — lower-right
      inner:    'rgba(30,  80, 200, 0.28)',
      outer:    'rgba(10,  40, 140, 0.10)',
      pos:      new THREE.Vector3( 55, -25, -80),
      scale:    90,
      rotSpeed: -0.006,
      baseOp:   0.16,
      pulseAmp: 0.05,
      pulseFreq: 0.55,
      phase:    1.2,
    },
    {
      // Teal — center-background
      inner:    'rgba(20, 160, 160, 0.22)',
      outer:    'rgba(10,  80,  90, 0.08)',
      pos:      new THREE.Vector3( 10,  10, -100),
      scale:    130,
      rotSpeed: 0.005,
      baseOp:   0.13,
      pulseAmp: 0.04,
      pulseFreq: 0.30,
      phase:    2.5,
    },
    {
      // Warm pink/magenta — upper-right
      inner:    'rgba(220,  60, 120, 0.25)',
      outer:    'rgba(140,  20,  80, 0.08)',
      pos:      new THREE.Vector3( 70,  40, -70),
      scale:    75,
      rotSpeed: -0.009,
      baseOp:   0.15,
      pulseAmp: 0.055,
      pulseFreq: 0.45,
      phase:    3.8,
    },
  ];

  const meshes = NEBULAE.map((cfg) => {
    const tex = makeNebulaTexture(cfg.inner, cfg.outer, 256);

    // Use a flat PlaneGeometry so we get UV-based texture and can rotate it
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map:         tex,
      transparent: true,
      opacity:     cfg.baseOp,
      depthWrite:  false,
      depthTest:   false,
      blending:    THREE.AdditiveBlending,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(cfg.pos);
    mesh.scale.setScalar(cfg.scale);

    // Tilt each nebula slightly so they don't all face the camera identically
    mesh.rotation.x = rand(-0.3, 0.3);
    mesh.rotation.y = rand(-0.3, 0.3);

    mesh.renderOrder = -3;
    scene.add(mesh);

    return { mesh, mat, cfg };
  });

  function update(time) {
    for (const { mesh, mat, cfg } of meshes) {
      // Slow rotation around the Z axis (plane-facing normal)
      mesh.rotation.z += cfg.rotSpeed * 0.016; // ~60fps delta approximation

      // Gentle opacity pulse between (baseOp - amp) and (baseOp + amp)
      mat.opacity =
        cfg.baseOp +
        cfg.pulseAmp * Math.sin(time * cfg.pulseFreq + cfg.phase);
    }
  }

  return { update };
}
