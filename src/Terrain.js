import * as THREE from 'three';

// ─── Simplex-style 3D value noise (CPU-side, no GLSL) ────────────────────────
// Based on Stefan Gustavson's simplex noise algorithm, ported to JS.

const PERM = new Uint8Array(512);
const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

function buildPermTable(seed) {
  // Seeded shuffle of 0-255
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Simple LCG seeded shuffle
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

function dot3(g, x, y, z) {
  return g[0] * x + g[1] * y + g[2] * z;
}

function noise3D(xin, yin, zin) {
  const F3 = 1.0 / 3.0;
  const G3 = 1.0 / 6.0;

  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const k = Math.floor(zin + s);

  const t = (i + j + k) * G3;
  const X0 = i - t, Y0 = j - t, Z0 = k - t;
  const x0 = xin - X0, y0 = yin - Y0, z0 = zin - Z0;

  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0)      { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
    else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
    else               { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
  } else {
    if (y0 < z0)       { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
    else if (x0 < z0)  { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
    else               { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
  }

  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2*G3, y2 = y0 - j2 + 2*G3, z2 = z0 - k2 + 2*G3;
  const x3 = x0 - 1 + 3*G3, y3 = y0 - 1 + 3*G3, z3 = z0 - 1 + 3*G3;

  const ii = i & 255, jj = j & 255, kk = k & 255;
  const gi0 = PERM[ii +     PERM[jj +     PERM[kk    ]]] % 12;
  const gi1 = PERM[ii+i1 + PERM[jj+j1 + PERM[kk+k1  ]]] % 12;
  const gi2 = PERM[ii+i2 + PERM[jj+j2 + PERM[kk+k2  ]]] % 12;
  const gi3 = PERM[ii+1  + PERM[jj+1  + PERM[kk+1   ]]] % 12;

  let n0=0, n1=0, n2=0, n3=0;
  let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
  if (t0 > 0) { t0 *= t0; n0 = t0*t0 * dot3(GRAD3[gi0], x0, y0, z0); }
  let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
  if (t1 > 0) { t1 *= t1; n1 = t1*t1 * dot3(GRAD3[gi1], x1, y1, z1); }
  let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
  if (t2 > 0) { t2 *= t2; n2 = t2*t2 * dot3(GRAD3[gi2], x2, y2, z2); }
  let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
  if (t3 > 0) { t3 *= t3; n3 = t3*t3 * dot3(GRAD3[gi3], x3, y3, z3); }

  // Scale to [-1, 1]
  return 32.0 * (n0 + n1 + n2 + n3);
}

function fbm(x, y, z, octaves = 6, lacunarity = 2.0, persistence = 0.5) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3D(x * frequency, y * frequency, z * frequency);
    maxValue += amplitude;
    frequency *= lacunarity;
    amplitude *= persistence;
  }
  return value / maxValue; // normalize to [-1, 1]
}

// ─── Biome color helpers ──────────────────────────────────────────────────────

function biomeColor(height, slope, planetConfig) {
  const {
    baseColor     = [0.1, 0.4, 0.8],
    secondColor   = [0.15, 0.5, 0.2],
    id            = '',
  } = planetConfig;

  // Planet type detection from id
  const isDesert  = id === 'reading';   // warm/sandy planet (Word World)
  const isIce     = id === 'logic';     // crystal/cold planet
  const isOcean   = id === 'geography'; // Earth-like water world
  const isTech    = id === 'coding';    // teal tech world
  const isMath    = id === 'math';      // blue math world
  const isBio     = id === 'science';   // green science world

  // Adjust height thresholds per planet type
  const snowLine    = isIce ? 51.5 : isDesert ? 56.0 : 54.0;
  const rockLine    = isIce ? 50.8 : 53.0;
  const forestLine  = isDesert ? 51.0 : 52.0;
  const grassLine   = isDesert ? 50.3 : 50.5;
  const shallowLine = isOcean  ? 50.2 : 50.0;
  const deepLine    = isOcean  ? 49.5 : 49.0;

  // Steep slopes become rock regardless of height
  const isRock = slope < 0.72 && height > 50.5;

  // Base biome
  let r, g, b;

  if (height < deepLine) {
    // Deep ocean
    if (isIce) { r=0.05; g=0.12; b=0.25; }
    else       { r=0.05; g=0.10; b=0.30; }
  } else if (height < shallowLine) {
    // Shallow water
    if (isIce) { r=0.10; g=0.20; b=0.40; }
    else       { r=0.10; g=0.25; b=0.50; }
  } else if (height < 50.5) {
    // Beach / shoreline
    if (isDesert) { r=0.85; g=0.72; b=0.45; }
    else if (isIce){ r=0.75; g=0.82; b=0.90; }
    else           { r=0.76; g=0.70; b=0.50; }
  } else if (height < grassLine + 0.2 && !isRock) {
    // Flat shoreline grass / tundra
    if (isDesert) { r=0.72; g=0.55; b=0.30; }
    else if (isIce){ r=0.65; g=0.78; b=0.85; }
    else           { r=0.20; g=0.55; b=0.20; }
  } else if (height < forestLine && !isRock) {
    // Grass/plains
    if (isDesert) { r=0.65; g=0.45; b=0.22; }
    else if (isIce){ r=0.55; g=0.70; b=0.80; }
    else if (isTech){ r=0.10; g=0.45; b=0.40; }
    else if (isBio) { r=0.15; g=0.55; b=0.18; }
    else            { r=0.15; g=0.50; b=0.15; }
  } else if (height < rockLine && !isRock) {
    // Forest / dense vegetation
    if (isDesert) { r=0.55; g=0.35; b=0.15; }
    else if (isIce){ r=0.45; g=0.62; b=0.75; }
    else if (isTech){ r=0.05; g=0.32; b=0.30; }
    else if (isBio) { r=0.08; g=0.38; b=0.10; }
    else            { r=0.08; g=0.30; b=0.08; }
  } else if (height < snowLine || isRock) {
    // Rock / highland
    if (isIce)    { r=0.50; g=0.58; b=0.70; }
    else if (isMath){ r=0.30; g=0.35; b=0.50; }
    else if (isTech){ r=0.15; g=0.32; b=0.28; }
    else           { r=0.40; g=0.35; b=0.30; }
  } else {
    // Snow / ice caps
    if (isDesert) { r=0.90; g=0.85; b=0.70; } // Sand dunes at peak
    else          { r=0.90; g=0.90; b=0.95; }
  }

  // Tint toward baseColor / secondColor
  // baseColor leans toward ocean/low areas, secondColor toward land/high
  const heightFactor = Math.max(0, Math.min(1, (height - 48) / 8));
  const bc = baseColor;
  const sc = secondColor;

  r = r * 0.75 + (bc[0] * (1 - heightFactor) + sc[0] * heightFactor) * 0.25;
  g = g * 0.75 + (bc[1] * (1 - heightFactor) + sc[1] * heightFactor) * 0.25;
  b = b * 0.75 + (bc[2] * (1 - heightFactor) + sc[2] * heightFactor) * 0.25;

  return [r, g, b];
}

// ─── POI data ─────────────────────────────────────────────────────────────────

const POI_TYPES = ['anomaly', 'resource', 'artifact', 'lifeform', 'structure', 'signal'];

const POI_POOL = [
  { type: 'anomaly',   name: 'Glowing Crystal Cave',      description: 'A cave full of rainbow crystals that hum softly in the dark!' },
  { type: 'artifact',  name: 'Ancient Star Map',           description: 'Stone tablets carved with a map of the entire galaxy — very old!' },
  { type: 'lifeform',  name: 'Friendly Space Bunny Colony', description: 'Fluffy creatures with antenna ears that love to share snacks.' },
  { type: 'resource',  name: 'Golden Meteorite Cluster',   description: 'Shiny rocks from a passing comet packed with rare minerals!' },
  { type: 'structure', name: 'Abandoned Moonbase',         description: 'A tiny base built long ago — the coffee machine still works!' },
  { type: 'signal',    name: 'Mystery Radio Beacon',       description: 'A repeating beep that spells out "HELLO" in ancient robot code.' },
  { type: 'anomaly',   name: 'Reverse Waterfall',          description: 'Water flows upward here because gravity got confused somehow.' },
  { type: 'artifact',  name: 'Giant Mossy Robot',          description: 'A huge robot frozen mid-wave, now covered in bright green moss.' },
  { type: 'lifeform',  name: 'Singing Mushroom Forest',    description: 'Mushrooms as tall as trees that whistle when wind blows through them!' },
  { type: 'resource',  name: 'Bubble Ore Vents',           description: 'Hot springs that bubble up glowing ore from deep underground.' },
  { type: 'structure', name: 'Floating Stone Arch',        description: 'A stone arch that somehow floats — magnets inside, probably?' },
  { type: 'signal',    name: 'Disco Crater',               description: 'A crater that flashes colored light every 12 seconds. Nobody knows why.' },
  { type: 'anomaly',   name: 'Tiny Thundercloud',          description: 'A storm cloud the size of a backpack that follows you around.' },
  { type: 'artifact',  name: 'Cosmic Sundial',             description: 'Tells the time on 14 different planets at once — pretty handy!' },
];

// ─── Sprite maker ─────────────────────────────────────────────────────────────

function makePOISprite(discovered) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const color = discovered ? '#22c55e' : '#fbbf24';
  const grd = ctx.createRadialGradient(32, 32, 2, 32, 32, 28);
  grd.addColorStop(0, color);
  grd.addColorStop(0.5, color + 'aa');
  grd.addColorStop(1, color + '00');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Sprite(mat);
}

// ─── Atmosphere shell (BackSide fresnel) ──────────────────────────────────────

const atmoVert = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmoFrag = /* glsl */`
  uniform vec3  uAtmosphereColor;
  varying vec3  vNormal;
  varying vec3  vPosition;
  void main() {
    vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(vPosition, 1.0)).xyz);
    float fresnel = 1.0 - abs(dot(vNormal, viewDir));
    fresnel = pow(fresnel, 1.6);
    vec3 lightDir = normalize(vec3(1.0, 0.5, 0.3));
    float lightSide = dot(vNormal, lightDir) * 0.5 + 0.5;
    float glow = fresnel * (0.55 + 0.45 * lightSide);
    gl_FragColor = vec4(uAtmosphereColor, glow * 0.90);
  }
`;

// ─── Cloud shell (noise-based opacity) ───────────────────────────────────────
// Cloud texture generated on a canvas using noise samples

function buildCloudTexture(seed) {
  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(SIZE, SIZE);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Spherical UV → 3D
      const u = x / SIZE, v = y / SIZE;
      const theta = u * Math.PI * 2;
      const phi   = v * Math.PI;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);

      const s = seed * 0.001;
      const n = fbm(nx * 3.5 + s, ny * 3.5 + s, nz * 3.5 + s, 5, 2.1, 0.48);
      const cloud = Math.max(0, n * 2.0 - 0.3); // threshold
      const alpha = Math.min(255, Math.floor(cloud * 255));

      const idx = (y * SIZE + x) * 4;
      imageData.data[idx    ] = 255;
      imageData.data[idx + 1] = 255;
      imageData.data[idx + 2] = 255;
      imageData.data[idx + 3] = alpha;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

// ─── createTerrain ────────────────────────────────────────────────────────────
/**
 * @param {Object} planetConfig  — planet entry from data.js (the .planet sub-object, plus .id)
 * @param {number} seed          — numeric seed for noise uniqueness
 * @returns {THREE.Group}
 */
export function createTerrain(planetConfig, seed = 42) {
  // Build the seeded permutation table for this planet
  buildPermTable(Math.floor(seed));

  const group = new THREE.Group();

  const BASE_RADIUS = 50;
  const SEA_LEVEL   = 50;
  const OCEAN_FLOOR = 48;
  const MOUNTAIN    = 55;

  // ── 1. Terrain sphere ─────────────────────────────────────────────────────
  // IcosahedronGeometry(50, 6) → ~40962 vertices, no pole pinching
  const geo = new THREE.IcosahedronGeometry(BASE_RADIUS, 6);

  // Convert to non-indexed so flat shading works correctly (each face has its own vertices)
  const indexedGeo = geo;
  const positions  = indexedGeo.attributes.position;
  const vertCount  = positions.count;

  // We'll accumulate vertex colors
  const colors     = new Float32Array(vertCount * 3);
  const normals    = indexedGeo.attributes.normal;

  // For each vertex: displace radially
  const tmp = new THREE.Vector3();

  // Determine ocean ratio modifier
  const isOceanWorld = planetConfig.id === 'geography';
  const isDesert     = planetConfig.id === 'reading';
  const isIce        = planetConfig.id === 'logic';

  // Ocean worlds: sea level sits higher → more ocean
  const heightScale  = isOceanWorld ? 3.5 : isDesert ? 5.5 : 5.0;
  const seaLevelBias = isOceanWorld ? 0.25 : isIce ? -0.1 : 0.0;

  const seedOff = seed * 0.137; // Offset noise space per seed

  for (let i = 0; i < vertCount; i++) {
    tmp.fromBufferAttribute(positions, i);

    // Normalized direction (unit sphere)
    const nx = tmp.x / BASE_RADIUS;
    const ny = tmp.y / BASE_RADIUS;
    const nz = tmp.z / BASE_RADIUS;

    // Multi-octave simplex fbm
    const n = fbm(
      nx + seedOff,
      ny + seedOff * 1.3,
      nz + seedOff * 0.7,
      6, 2.0, 0.5
    );

    // Map noise [-1,1] → displacement
    // n in range ~[-0.5, 0.5] after fbm normalization
    // Ocean floor = 48, sea level = 50, mountains = 55
    const displacement = (n + seaLevelBias) * heightScale; // ±heightScale around sea level
    const radius = BASE_RADIUS + displacement;

    // Clamp to [OCEAN_FLOOR, MOUNTAIN]
    const clampedR = Math.max(OCEAN_FLOOR, Math.min(MOUNTAIN, radius));

    positions.setXYZ(i, nx * clampedR, ny * clampedR, nz * clampedR);
  }

  positions.needsUpdate = true;

  // Recompute normals (required after displacement)
  indexedGeo.computeVertexNormals();

  // ── 2. Vertex colors ──────────────────────────────────────────────────────
  const recomputedNormals = indexedGeo.attributes.normal;

  for (let i = 0; i < vertCount; i++) {
    tmp.fromBufferAttribute(positions, i);
    const height = tmp.length(); // distance from center = current radius

    // Radial direction (unit)
    const rx = tmp.x / height;
    const ry = tmp.y / height;
    const rz = tmp.z / height;

    // Normal at this vertex
    const nx = recomputedNormals.getX(i);
    const ny = recomputedNormals.getY(i);
    const nz = recomputedNormals.getZ(i);

    // Slope: dot(normal, radial). 1 = flat, 0 = vertical cliff
    const slope = nx * rx + ny * ry + nz * rz;

    const [r, g, b] = biomeColor(height, slope, planetConfig);
    colors[i * 3    ] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  indexedGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness:    0.8,
    metalness:    0.1,
    flatShading:  true,
  });

  const terrainMesh = new THREE.Mesh(indexedGeo, terrainMat);
  terrainMesh.castShadow    = true;
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // ── 3. Water sphere (sea level) ───────────────────────────────────────────
  const waterGeo = new THREE.SphereGeometry(SEA_LEVEL, 64, 64);
  const waterMat = new THREE.MeshStandardMaterial({
    color:       0x1155AA,
    transparent: true,
    opacity:     isDesert ? 0.20 : isIce ? 0.55 : 0.70,
    roughness:   0.2,
    metalness:   0.3,
    depthWrite:  false,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  group.add(waterMesh);

  // ── 4. Atmosphere shell ───────────────────────────────────────────────────
  const atmoColor = planetConfig.atmosphereColor || [0.4, 0.6, 1.0];
  const atmoGeo   = new THREE.SphereGeometry(56, 32, 32);
  const atmoMat   = new THREE.ShaderMaterial({
    vertexShader:   atmoVert,
    fragmentShader: atmoFrag,
    uniforms: {
      uAtmosphereColor: { value: new THREE.Color(...atmoColor) },
    },
    side:        THREE.BackSide,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });
  group.add(new THREE.Mesh(atmoGeo, atmoMat));

  // ── 5. Cloud shell ────────────────────────────────────────────────────────
  const cloudTex = buildCloudTexture(seed);
  const cloudGeo = new THREE.SphereGeometry(51.5, 64, 64);
  const cloudMat = new THREE.MeshStandardMaterial({
    map:         cloudTex,
    transparent: true,
    opacity:     isDesert ? 0.25 : 0.65,
    depthWrite:  false,
    color:       0xffffff,
    roughness:   1.0,
    metalness:   0.0,
  });
  const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  group.add(cloudMesh);

  // ── 6. POIs ───────────────────────────────────────────────────────────────
  // Collect above-sea-level vertex indices
  const aboveSeaIndices = [];
  for (let i = 0; i < vertCount; i++) {
    tmp.fromBufferAttribute(positions, i);
    if (tmp.length() > SEA_LEVEL + 0.3) aboveSeaIndices.push(i);
  }

  const poiCount = 8 + Math.floor(((seed % 100) / 100) * 5); // 8-12 POIs
  const pois = [];
  const usedPoolIndices = new Set();

  // Shuffle available pool entries
  const poolOrder = [];
  for (let i = 0; i < POI_POOL.length; i++) poolOrder.push(i);
  // Deterministic shuffle using seed
  for (let i = poolOrder.length - 1; i > 0; i--) {
    const j = Math.floor(((seed * 9301 + i * 49297) % 233280) / 233280 * (i + 1));
    [poolOrder[i], poolOrder[j]] = [poolOrder[j], poolOrder[i]];
  }

  for (let p = 0; p < Math.min(poiCount, POI_POOL.length); p++) {
    if (aboveSeaIndices.length === 0) break;

    // Pick a random vertex deterministically
    const randIdx = Math.floor(((seed * 1664525 + p * 1013904223) >>> 0) % aboveSeaIndices.length);
    const vtxIdx  = aboveSeaIndices[randIdx];

    tmp.fromBufferAttribute(positions, vtxIdx);
    const pos = tmp.clone();

    // Push the POI slightly above the surface
    pos.normalize().multiplyScalar(pos.length() + 0.8);

    const poolEntry = POI_POOL[poolOrder[p]];
    const poi = {
      type:        poolEntry.type,
      position:    pos.clone(),
      name:        poolEntry.name,
      description: poolEntry.description,
      discovered:  false,
    };
    pois.push(poi);

    // Sprite marker
    const sprite = makePOISprite(false);
    sprite.position.copy(pos);
    sprite.scale.set(3, 3, 3);
    sprite.userData.poiIndex = p;
    sprite.userData.baseScale = 3;
    group.add(sprite);
    poi._sprite = sprite;
  }

  group.userData.pois = pois;

  // ── 7. Lighting ───────────────────────────────────────────────────────────
  const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.4);
  sunLight.position.set(1, 0.5, 0.3).normalize().multiplyScalar(200);
  sunLight.castShadow = true;
  group.add(sunLight);

  const ambLight = new THREE.AmbientLight(0x202030, 0.15);
  group.add(ambLight);

  // ── 8. Update method ──────────────────────────────────────────────────────
  group.userData.update = (time) => {
    // Clouds drift independently
    cloudMesh.rotation.y = time * 0.06;
    cloudMesh.rotation.x = Math.sin(time * 0.02) * 0.01;

    // POI pulse animation
    for (let i = 0; i < pois.length; i++) {
      const poi    = pois[i];
      const sprite = poi._sprite;
      if (!sprite) continue;

      const pulse     = 1 + 0.25 * Math.sin(time * 2.5 + i * 1.3);
      const baseScale = poi.discovered ? 2.5 : 3.0;
      sprite.scale.setScalar(baseScale * pulse);

      // Fade in/out opacity
      sprite.material.opacity = poi.discovered
        ? 0.7 + 0.15 * Math.sin(time * 1.8 + i)
        : 0.8 + 0.15 * Math.sin(time * 2.5 + i * 1.3);
    }
  };

  // ── 9. discoverPOI helper ─────────────────────────────────────────────────
  group.userData.discoverPOI = (index) => {
    const poi = pois[index];
    if (!poi || poi.discovered) return poi;
    poi.discovered = true;

    // Rebuild sprite in green
    const oldSprite = poi._sprite;
    if (oldSprite) {
      group.remove(oldSprite);
      oldSprite.material.map.dispose();
      oldSprite.material.dispose();
    }
    const sprite = makePOISprite(true);
    sprite.position.copy(poi.position);
    sprite.scale.setScalar(2.5);
    sprite.userData.poiIndex = index;
    group.add(sprite);
    poi._sprite = sprite;

    return poi;
  };

  return group;
}
