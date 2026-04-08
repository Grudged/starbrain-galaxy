// Galaxy map data — 6 star systems, one per subject
export const SYSTEMS = [
  {
    id: 'math',
    name: 'Number Nebula',
    desc: 'A system of equations and cosmic calculations',
    color: 0x4A90D9,
    emissive: 0x2255AA,
    starColor: 0x88BBFF,
    // Position in galaxy view (spread across the scene)
    galaxyPos: { x: -8, y: 1.5, z: -3 },
    planet: {
      radius: 1.2,
      // Planet shader params
      baseColor: [0.15, 0.35, 0.75],
      secondColor: [0.1, 0.2, 0.5],
      atmosphereColor: [0.3, 0.5, 1.0],
      ringColor: [0.5, 0.7, 1.0],  // Saturn-like ring
      hasRing: true,
      rotationSpeed: 0.3,
      cloudDensity: 0.4,
    }
  },
  {
    id: 'reading',
    name: 'Word World',
    desc: 'Where stories come alive among the stars',
    color: 0xE8734A,
    emissive: 0xAA4422,
    starColor: 0xFFAA66,
    galaxyPos: { x: 5, y: -1, z: -6 },
    planet: {
      radius: 1.0,
      baseColor: [0.85, 0.45, 0.25],
      secondColor: [0.6, 0.2, 0.4],
      atmosphereColor: [1.0, 0.6, 0.3],
      hasRing: false,
      rotationSpeed: 0.25,
      cloudDensity: 0.6,
    }
  },
  {
    id: 'science',
    name: 'Lab Planet',
    desc: 'Bubbling with experiments and discovery',
    color: 0x2ECC71,
    emissive: 0x11AA44,
    starColor: 0x66FF99,
    galaxyPos: { x: -3, y: -2, z: -9 },
    planet: {
      radius: 1.4,
      baseColor: [0.1, 0.6, 0.3],
      secondColor: [0.05, 0.3, 0.25],
      atmosphereColor: [0.2, 0.8, 0.5],
      hasRing: false,
      rotationSpeed: 0.2,
      cloudDensity: 0.7,
    }
  },
  {
    id: 'geography',
    name: 'Earth Explorer',
    desc: 'An ocean world of continents and climates',
    color: 0x3498DB,
    emissive: 0x1166AA,
    starColor: 0x55AAFF,
    galaxyPos: { x: 9, y: 2, z: -4 },
    planet: {
      radius: 1.3,
      baseColor: [0.15, 0.4, 0.7],
      secondColor: [0.2, 0.55, 0.15],  // Green landmasses
      atmosphereColor: [0.4, 0.6, 1.0],
      hasRing: false,
      rotationSpeed: 0.35,
      cloudDensity: 0.5,
    }
  },
  {
    id: 'logic',
    name: 'Puzzle Station',
    desc: 'A crystalline world of patterns and riddles',
    color: 0x9B59B6,
    emissive: 0x6633AA,
    starColor: 0xCC88FF,
    galaxyPos: { x: -6, y: 3, z: -7 },
    planet: {
      radius: 1.1,
      baseColor: [0.45, 0.2, 0.6],
      secondColor: [0.3, 0.1, 0.4],
      atmosphereColor: [0.6, 0.3, 0.9],
      hasRing: true,
      ringColor: [0.7, 0.4, 1.0],
      rotationSpeed: 0.15,
      cloudDensity: 0.3,
    }
  },
  {
    id: 'coding',
    name: 'Code Cove',
    desc: 'Digital circuits pulse with robotic life',
    color: 0x1ABC9C,
    emissive: 0x088866,
    starColor: 0x44FFCC,
    galaxyPos: { x: 3, y: -3, z: -11 },
    planet: {
      radius: 1.15,
      baseColor: [0.05, 0.5, 0.45],
      secondColor: [0.02, 0.2, 0.25],
      atmosphereColor: [0.1, 0.8, 0.7],
      hasRing: false,
      rotationSpeed: 0.4,
      cloudDensity: 0.2,
    }
  }
];

// Zoom states
export const VIEW = {
  GALAXY: 'galaxy',
  SYSTEM: 'system',
  PLANET: 'planet'
};
