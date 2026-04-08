import * as THREE from 'three';

// ─── Ashima / webgl-noise simplex noise (snoise vec3) ────────────────────────
// Inlined into GLSL string constants so each shader that needs it can import it.
const GLSL_NOISE = /* glsl */`
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Fractional Brownian Motion — stacks octaves for richer terrain
float fbm(vec3 p) {
  float v = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    v += amp * snoise(p * freq);
    freq *= 2.1;
    amp  *= 0.48;
  }
  return v;
}
`;

// ─── Planet surface shader ────────────────────────────────────────────────────
const planetVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const planetFrag = /* glsl */`
  ${GLSL_NOISE}

  uniform vec3  uBaseColor;
  uniform vec3  uSecondColor;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;

  void main() {
    // Animated 3D noise — drift the sample point over time for a living surface
    vec3 samplePos = vPosition * 1.8 + vec3(uTime * 0.04, uTime * 0.025, uTime * 0.015);

    // Two-layer fbm: coarse continents + fine detail
    float continent = fbm(samplePos * 0.6);
    float detail    = fbm(samplePos * 2.5 + vec3(41.3, 17.9, 8.4));
    float terrain   = continent * 0.7 + detail * 0.3;
    terrain = smoothstep(-0.35, 0.45, terrain);

    // Shore blend — thin transition band between land and sea
    float shoreMask = 1.0 - smoothstep(0.38, 0.50, terrain);
    vec3  shoreColor = mix(uBaseColor, uSecondColor, 0.4) * 1.15;

    vec3 surface = mix(uBaseColor, uSecondColor, terrain);
    surface = mix(surface, shoreColor, shoreMask * 0.5);

    // Diffuse lighting from a fixed "sun" direction
    vec3 lightDir = normalize(vec3(1.0, 0.6, 0.8));
    float diff = dot(vNormal, lightDir);
    // Wrap lighting — softer shadow terminator
    diff = diff * 0.5 + 0.5;
    diff = pow(diff, 1.3);

    // Specular highlight on the sea (lower terrain values = ocean)
    float specMask = 1.0 - terrain;
    vec3  reflDir  = reflect(-lightDir, vNormal);
    vec3  viewDir  = normalize(cameraPosition - (modelMatrix * vec4(vPosition, 1.0)).xyz);
    float spec = pow(max(dot(reflDir, viewDir), 0.0), 48.0) * specMask * 0.6;

    // Fresnel rim — atmosphere tint bleeds into edge
    float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
    fresnel = pow(fresnel, 3.5);

    // Polar icecaps — whiten near poles
    float pole = abs(vPosition.y) / 1.0; // normalised 0-1
    float ice  = smoothstep(0.55, 0.78, pole + snoise(samplePos * 3.0) * 0.08);
    surface = mix(surface, vec3(0.92, 0.96, 1.0), ice);

    vec3 color = surface * diff;
    color += vec3(spec);
    color = mix(color, uBaseColor * 1.6 + vec3(0.1, 0.15, 0.25), fresnel * 0.25);

    // Subtle colour temperature variation across the surface
    float warm = snoise(samplePos * 0.4 + vec3(99.1)) * 0.5 + 0.5;
    color *= mix(vec3(1.0, 0.97, 0.94), vec3(0.94, 0.97, 1.0), warm);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ─── Atmosphere shader ────────────────────────────────────────────────────────
const atmosphereVert = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFrag = /* glsl */`
  uniform vec3  uAtmosphereColor;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(vPosition, 1.0)).xyz);

    // Fresnel — strongest at grazing angles (the edge of the sphere)
    float fresnel = 1.0 - abs(dot(vNormal, viewDir));
    fresnel = pow(fresnel, 1.8);

    // Light-side brightening — atmosphere scatters more on the lit hemisphere
    vec3  lightDir  = normalize(vec3(1.0, 0.6, 0.8));
    float lightSide = dot(vNormal, lightDir) * 0.5 + 0.5;
    float glow = fresnel * (0.6 + 0.4 * lightSide);

    // Slow colour shimmer to keep it alive
    float shimmer = sin(uTime * 0.3 + vPosition.y * 4.0) * 0.04 + 0.96;
    vec3  color   = uAtmosphereColor * shimmer;

    // Inner limb — slightly warmer/brighter haze band
    float limb = pow(fresnel, 4.0);
    color = mix(color, color * 1.4 + vec3(0.05, 0.08, 0.05), limb);

    gl_FragColor = vec4(color, glow * 0.88);
  }
`;

// ─── Cloud shader ─────────────────────────────────────────────────────────────
const cloudVert = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cloudFrag = /* glsl */`
  ${GLSL_NOISE}

  uniform float uTime;
  uniform float uCloudDensity;

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // Animated cloud noise — separate drift speed from surface
    vec3 p = vPosition * 2.2 + vec3(uTime * 0.06, uTime * -0.03, uTime * 0.05);
    float clouds = fbm(p);

    // Shape into patchy cloud bands
    clouds = smoothstep(0.05 - uCloudDensity * 0.4, 0.35, clouds);

    // Soft lighting on clouds
    vec3  lightDir = normalize(vec3(1.0, 0.6, 0.8));
    float diff     = dot(vNormal, lightDir) * 0.4 + 0.6;

    vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(vPosition, 1.0)).xyz);
    float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
    float edge    = pow(fresnel, 3.0) * 0.3; // soften at limb

    float alpha = clouds * uCloudDensity * (diff + edge);
    alpha = clamp(alpha, 0.0, 0.92);

    // Pure white cloud tops, slightly off-white in shadow
    vec3 cloudColor = mix(vec3(0.85, 0.87, 0.92), vec3(1.0), diff * 0.6);

    gl_FragColor = vec4(cloudColor, alpha);
  }
`;

// ─── Ring shader ──────────────────────────────────────────────────────────────
const ringVert = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFrag = /* glsl */`
  ${GLSL_NOISE}

  uniform vec3  uRingColor;
  uniform float uInnerRadius; // 0-1 normalised UV
  uniform float uTime;

  varying vec2 vUv;

  void main() {
    // RingGeometry UVs: u spans inner->outer edge
    float t = vUv.x; // 0 = inner edge, 1 = outer edge

    // Opacity: peak in the middle band, fade at inner & outer rim
    float opacity = sin(t * 3.14159);
    opacity = pow(opacity, 0.6);

    // Procedural ring bands — Cassini-division style gaps
    vec3 samplePos = vec3(vUv * 18.0, uTime * 0.02);
    float bands = snoise(samplePos * vec3(1.0, 0.1, 1.0)) * 0.5 + 0.5;
    float gap   = smoothstep(0.35, 0.45, t) * (1.0 - smoothstep(0.52, 0.60, t));
    opacity *= mix(1.0, bands * 0.6, 0.5);
    opacity *= (1.0 - gap * 0.65);

    // Color — slight gradient from warm inner to cool outer
    vec3 inner = uRingColor * 1.2;
    vec3 outer = uRingColor * 0.7 + vec3(0.05, 0.05, 0.1);
    vec3 color = mix(inner, outer, t);

    // Particle glitter
    float glitter = snoise(samplePos * 40.0) * 0.5 + 0.5;
    glitter = pow(glitter, 6.0) * 0.4;
    color += vec3(glitter);

    gl_FragColor = vec4(color, opacity * 0.82);
  }
`;

// ─── createPlanet ─────────────────────────────────────────────────────────────
/**
 * Creates a stylised 3D planet group.
 *
 * @param {Object} config
 * @param {number}   config.radius
 * @param {number[]} config.baseColor        — RGB 0-1
 * @param {number[]} config.secondColor      — RGB 0-1
 * @param {number[]} config.atmosphereColor  — RGB 0-1
 * @param {number[]} [config.ringColor]      — RGB 0-1
 * @param {boolean}  [config.hasRing]
 * @param {number}   config.rotationSpeed
 * @param {number}   config.cloudDensity
 * @returns {THREE.Group}
 */
export function createPlanet(config) {
  const {
    radius         = 1.0,
    baseColor      = [0.2, 0.4, 0.8],
    secondColor    = [0.1, 0.2, 0.5],
    atmosphereColor = [0.3, 0.5, 1.0],
    ringColor      = [0.6, 0.7, 0.9],
    hasRing        = false,
    rotationSpeed  = 0.3,
    cloudDensity   = 0.4,
  } = config;

  const group = new THREE.Group();

  // Shared uniform references so update() can reach them
  const uniforms = {
    planet: null,
    atmosphere: null,
    clouds: null,
    ring: null,
  };

  // ── 1. Planet sphere ──────────────────────────────────────────────────────
  const planetGeo = new THREE.SphereGeometry(radius, 64, 64);
  const planetUniforms = {
    uBaseColor:   { value: new THREE.Color(...baseColor) },
    uSecondColor: { value: new THREE.Color(...secondColor) },
    uTime:        { value: 0.0 },
  };
  const planetMat = new THREE.ShaderMaterial({
    vertexShader:   planetVert,
    fragmentShader: planetFrag,
    uniforms:       planetUniforms,
  });
  const planetMesh = new THREE.Mesh(planetGeo, planetMat);
  group.add(planetMesh);
  uniforms.planet = planetUniforms;

  // ── 2. Atmosphere glow ────────────────────────────────────────────────────
  const atmoGeo = new THREE.SphereGeometry(radius * 1.15, 64, 64);
  const atmoUniforms = {
    uAtmosphereColor: { value: new THREE.Color(...atmosphereColor) },
    uTime:            { value: 0.0 },
  };
  const atmoMat = new THREE.ShaderMaterial({
    vertexShader:   atmosphereVert,
    fragmentShader: atmosphereFrag,
    uniforms:       atmoUniforms,
    side:           THREE.BackSide,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
  });
  const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
  group.add(atmoMesh);
  uniforms.atmosphere = atmoUniforms;

  // Second atmosphere pass — front-side for extra softness on the limb
  const atmoFrontMat = new THREE.ShaderMaterial({
    vertexShader:   atmosphereVert,
    fragmentShader: atmosphereFrag,
    uniforms:       atmoUniforms, // shared reference
    side:           THREE.FrontSide,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
  });
  // Wrap in a slightly larger sphere so it crowns over the surface
  const atmoFrontMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.12, 64, 64),
    atmoFrontMat,
  );
  group.add(atmoFrontMesh);

  // ── 3. Cloud layer ────────────────────────────────────────────────────────
  let cloudMesh = null;
  if (cloudDensity > 0) {
    const cloudGeo = new THREE.SphereGeometry(radius * 1.02, 64, 64);
    const cloudUniforms = {
      uTime:         { value: 0.0 },
      uCloudDensity: { value: cloudDensity },
    };
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader:   cloudVert,
      fragmentShader: cloudFrag,
      uniforms:       cloudUniforms,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.FrontSide,
    });
    cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    group.add(cloudMesh);
    uniforms.clouds = cloudUniforms;
  }

  // ── 4. Ring ───────────────────────────────────────────────────────────────
  let ringMesh = null;
  if (hasRing) {
    // RingGeometry UV.x goes 0->1 from inner->outer radius
    const ringGeo = new THREE.RingGeometry(radius * 1.6, radius * 2.4, 128, 4);
    const ringUniforms = {
      uRingColor:   { value: new THREE.Color(...ringColor) },
      uInnerRadius: { value: 0.0 },
      uTime:        { value: 0.0 },
    };
    const ringMat = new THREE.ShaderMaterial({
      vertexShader:   ringVert,
      fragmentShader: ringFrag,
      uniforms:       ringUniforms,
      side:           THREE.DoubleSide,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.NormalBlending,
    });
    ringMesh = new THREE.Mesh(ringGeo, ringMat);
    // Tilt like Saturn — ~75° from vertical, with a slight forward lean
    ringMesh.rotation.x = Math.PI * 0.42;
    ringMesh.rotation.z = Math.PI * 0.06;
    group.add(ringMesh);
    uniforms.ring = ringUniforms;
  }

  // ── 5. Update method ──────────────────────────────────────────────────────
  group.userData.update = (time) => {
    // Planet rotation
    planetMesh.rotation.y = time * rotationSpeed;

    // Time uniforms for animated shaders
    uniforms.planet.uTime.value     = time;
    uniforms.atmosphere.uTime.value = time;

    // Clouds drift slightly faster — different weather pattern
    if (cloudMesh) {
      cloudMesh.rotation.y = time * (rotationSpeed * 1.18);
      uniforms.clouds.uTime.value = time;
    }

    // Gentle ring wobble — lazy precession
    if (ringMesh) {
      ringMesh.rotation.z = Math.PI * 0.06 + Math.sin(time * 0.15) * 0.015;
      ringMesh.rotation.x = Math.PI * 0.42 + Math.cos(time * 0.11) * 0.008;
      uniforms.ring.uTime.value = time;
    }
  };

  return group;
}
