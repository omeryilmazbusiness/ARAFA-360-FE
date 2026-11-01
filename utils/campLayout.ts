import { Matrix4, Quaternion, Vector3 } from "three";

/**
 * Tent camp = ONE architectural blueprint (`tent-plan.JPG`) reproduced 1:1.
 *
 * There is no procedural generation: `BLUEPRINT_LAYOUT` lists every tent of the plan with the exact
 * real-world size printed on it and its position in metres. Everything is axis-aligned (0° / 90°).
 *
 * Coordinates of the blueprint are in METRES, relative to the blueprint origin:
 *   +x = plan right (towards the mountain), +z = plan down, (0, 0) = east edge of the tents,
 *   vertical middle of the plan. `width` runs along X, `depth` along Z.
 *
 * Scale: the mountain is ~10 units wide ≈ 250 m of real terrain  →  1 m = 0.04 units
 * (1 unit = 25 m). A 25×15 m tent is therefore 1.0 × 0.6 units.
 */

/** Strict real-world → Three.js scale: metres × METERS_TO_UNITS = world units. */
export const METERS_TO_UNITS = 0.04;

export type BlueprintBuilding = {
  /** Extent along X, metres. */
  width: number;
  /** Extent along Z, metres. */
  depth: number;
  /** Centre, metres, relative to the blueprint origin. */
  x: number;
  z: number;
};

/**
 * Every tent of the blueprint (46). Trailing comments are the labels printed on the plan
 * (long × short side). Rows of tents share the same z, columns keep the plan's ~4.5 m walkways,
 * the 6–10 m avenues between the macro-blocks are the empty bands between the groups below.
 */
export const BLUEPRINT_LAYOUT: readonly BlueprintBuilding[] = [
  // North strip
  { width: 15, depth: 25, x: -74.0, z: -133.0 }, // 25x15
  { width: 15, depth: 25, x: -55.0, z: -133.0 }, // 25x15
  { width: 15, depth: 25, x: -15.0, z: -105.0 }, // 25x15
  { width: 15, depth: 15, x: -74.5, z: -106.0 }, // 15x15
  { width: 10, depth: 20, x: -32.0, z: -103.0 }, // 10x20
  { width: 5, depth: 25, x: -90.0, z: -101.0 }, // 5x25
  { width: 20, depth: 10, x: -38.5, z: -78.0 }, // 10x20
  { width: 5, depth: 10, x: -6.5, z: -73.5 }, // 5x10
  { width: 20, depth: 15, x: -38.5, z: -57.0 }, // 15x20
  { width: 20, depth: 10, x: -11.5, z: -54.5 }, // 10x20
  { width: 25, depth: 5, x: -64.5, z: -54.0 }, // 5x25
  // Upper block
  { width: 10, depth: 25, x: -93.0, z: -32.0 }, // 10x25
  { width: 15, depth: 25, x: -76.0, z: -32.0 }, // 25x15
  { width: 15, depth: 25, x: -56.5, z: -32.0 }, // 25x15
  { width: 15, depth: 25, x: -37.0, z: -32.0 }, // 25x15
  { width: 15, depth: 25, x: -18.0, z: -32.0 }, // 25x15
  { width: 10, depth: 10, x: -105.5, z: -31.0 }, // 10x10
  { width: 5, depth: 15, x: -4.0, z: -37.5 }, // 5x15
  // Middle block
  { width: 10, depth: 25, x: -114.5, z: 0.0 }, // 10x25
  { width: 15, depth: 25, x: -96.5, z: 0.0 }, // 25x15
  { width: 15, depth: 25, x: -77.0, z: 0.0 }, // 25x15
  { width: 15, depth: 25, x: -57.5, z: 0.0 }, // 25x15
  { width: 15, depth: 15, x: -38.0, z: -5.0 }, // 15x15
  { width: 20, depth: 15, x: -12.5, z: -2.5 }, // 15x20
  { width: 15, depth: 10, x: -36.5, z: 11.0 }, // 10x15
  { width: 10, depth: 25, x: -79.0, z: 34.5 }, // 10x25
  { width: 5, depth: 25, x: -91.0, z: 34.5 }, // 5x25
  { width: 15, depth: 25, x: -38.5, z: 34.5 }, // 25x15
  { width: 20, depth: 10, x: -14.5, z: 43.5 }, // 10x20
  // Lower block
  { width: 15, depth: 20, x: -109.0, z: 67.0 }, // 15x20
  { width: 5, depth: 20, x: -90.5, z: 67.0 }, // 5x20
  { width: 15, depth: 20, x: -77.5, z: 67.0 }, // 15x20
  { width: 15, depth: 20, x: -58.0, z: 67.0 }, // 15x20
  { width: 15, depth: 20, x: -39.0, z: 67.0 }, // 15x20
  { width: 20, depth: 10, x: -11.0, z: 76.5 }, // 10x20
  // South strip
  { width: 15, depth: 25, x: -109.5, z: 100.0 }, // 25x15
  { width: 5, depth: 15, x: -92.0, z: 93.5 }, // 5x15
  { width: 15, depth: 10, x: -76.5, z: 92.0 }, // 10x15
  { width: 15, depth: 25, x: -59.0, z: 100.0 }, // 25x15
  { width: 5, depth: 15, x: -71.0, z: 105.5 }, // 5x15
  { width: 15, depth: 25, x: -39.5, z: 100.0 }, // 25x15
  { width: 15, depth: 25, x: -20.5, z: 100.0 }, // 25x15
  { width: 15, depth: 25, x: -60.0, z: 133.0 }, // 25x15
  { width: 15, depth: 25, x: -40.5, z: 133.0 }, // 25x15
  { width: 15, depth: 25, x: -21.0, z: 133.0 }, // 25x15
  { width: 15, depth: 15, x: -79.0, z: 138.5 }, // 15x15
];

/** Sanitary blocks (the cyan strips of the plan, ~4 × 18.5 m). Not tents: rendered separately. */
export const SANITARY_LAYOUT: readonly BlueprintBuilding[] = [
  { width: 4, depth: 18.5, x: -59.5, z: -74.0 },
  { width: 4, depth: 18.5, x: -15.0, z: -76.0 },
  { width: 4, depth: 18.5, x: -16.5, z: 22.5 },
  { width: 4, depth: 18.5, x: -113.5, z: 29.0 },
  { width: 4, depth: 18.5, x: -59.5, z: 29.0 },
  { width: 4, depth: 18.5, x: -83.0, z: 115.0 },
];

/**
 * Where the blueprint origin lands in the world (units). The plan's east edge faces the mountain
 * and keeps ≈ 1.2 units (≈ 30 m) of clear ground to the rock; the plan is centred on z = 0. It sits
 * on the west side so the stairway fly-through (east side) stays unobstructed.
 */
export const BLUEPRINT_ORIGIN = { x: -6.5, z: 0 } as const;

/** Resting height: a hair above the ground plane so the bases never z-fight with it. */
export const GROUND_Y = 0.002;

/** Rectangular canvas walls under a gabled roof (metres). */
export const WALL_HEIGHT_M = 3;
const ROOF_RISE_PER_SHORT_SIDE = 0.17;
const ROOF_RISE_MIN_M = 1.2;
const ROOF_RISE_MAX_M = 2.6;
/** Sanitary blocks: flat-roofed, a bit lower than the tents. */
export const SANITARY_HEIGHT_M = 2.6;

export const TENT_COUNT = BLUEPRINT_LAYOUT.length;
export const SANITARY_COUNT = SANITARY_LAYOUT.length;

/**
 * Mountain footprint: farthest horizontal extent of the mesh (incl. its stairways) for 48
 * equal bearings, starting at -π (the -X axis) and increasing with `atan2(z, x)`. Baked from the
 * actual vertex data of `arafat.glb`.
 */
const FOOTPRINT_RADII = [
  5.11, 5.46, 5.5, 5.5, 5.5, 5.42, 5.29, 5.22, 5.17, 5.09, 5.01, 4.79, 4.68, 4.55, 4.4, 4.21, 4.07,
  4, 4.11, 4.38, 4.63, 4.73, 4.85, 5.09, 5.16, 5.16, 5.16, 5.13, 4.96, 4.78, 4.58, 4.6, 4.6, 4.6,
  4.68, 4.68, 4.68, 4.65, 4.65, 4.97, 4.97, 4.97, 3.87, 3.88, 3.88, 3.91, 4.15, 4.48,
];

/** Footprint radius at world position (x, z), linearly interpolated between the baked bearings. */
export function mountainFootprintRadius(x: number, z: number): number {
  const n = FOOTPRINT_RADII.length;
  const u = ((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * n - 0.5; // bin centres
  const i0 = Math.floor(u);
  const f = u - i0;
  const a = FOOTPRINT_RADII[((i0 % n) + n) % n];
  const b = FOOTPRINT_RADII[(((i0 + 1) % n) + n) % n];
  return a + (b - a) * f;
}

/** Axis-aligned world footprint (units) of a blueprint building. */
export type Footprint = { x: number; z: number; halfX: number; halfZ: number };

export function toWorldFootprint(b: BlueprintBuilding): Footprint {
  return {
    x: BLUEPRINT_ORIGIN.x + b.x * METERS_TO_UNITS,
    z: BLUEPRINT_ORIGIN.z + b.z * METERS_TO_UNITS,
    halfX: (b.width * METERS_TO_UNITS) / 2,
    halfZ: (b.depth * METERS_TO_UNITS) / 2,
  };
}

/** World-space bounds of the whole camp (units) – used to fit the shadow frustum around it. */
export const CAMP_BOUNDS = (() => {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const t of [...BLUEPRINT_LAYOUT, ...SANITARY_LAYOUT]) {
    const f = toWorldFootprint(t);
    b.minX = Math.min(b.minX, f.x - f.halfX);
    b.maxX = Math.max(b.maxX, f.x + f.halfX);
    b.minZ = Math.min(b.minZ, f.z - f.halfZ);
    b.maxZ = Math.max(b.maxZ, f.z + f.halfZ);
  }
  return { ...b, maxHeight: (WALL_HEIGHT_M + ROOF_RISE_MAX_M) * METERS_TO_UNITS };
})();

/** Small, fast, seedable PRNG (mulberry32) – the tints are identical on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type CampBuffers = {
  count: number;
  /** Column-major 4×4 matrices (16 floats per instance) for the unit roof / unit wall box geometry. */
  roofMatrices: Float32Array;
  wallMatrices: Float32Array;
  /** Per-tent RGB multipliers for `instanceColor` (±5 % brightness, faint warmth). */
  tints: Float32Array;
};

/**
 * Instance matrices for the tents of `BLUEPRINT_LAYOUT`. Both meshes use unit geometries
 * (x/z ∈ [-½, ½], y ∈ [0, 1], resting on y = 0), so the matrix scale IS the real size:
 *   walls  scale (width, wallHeight, depth)  at y = ground
 *   roof   scale (width, roofRise,  depth)   at y = ground + wallHeight, i.e. right on the walls
 * with the identical X/Z footprint. When a tent is deeper than wide, the roof is turned by exactly
 * 90° (and its X/Z scales swapped) so its ridge always follows the long side. No other rotation.
 */
export function buildTentBuffers(layout: readonly BlueprintBuilding[] = BLUEPRINT_LAYOUT): CampBuffers {
  const count = layout.length;
  const roofMatrices = new Float32Array(count * 16);
  const wallMatrices = new Float32Array(count * 16);
  const m = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const upright = new Quaternion();
  const quarterTurn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  const wallH = WALL_HEIGHT_M * METERS_TO_UNITS;

  layout.forEach((tent, n) => {
    const f = toWorldFootprint(tent);
    const w = tent.width * METERS_TO_UNITS;
    const d = tent.depth * METERS_TO_UNITS;

    position.set(f.x, GROUND_Y, f.z);
    scale.set(w, wallH, d);
    m.compose(position, upright, scale).toArray(wallMatrices, n * 16);

    const shortM = Math.min(tent.width, tent.depth);
    const rise =
      Math.min(ROOF_RISE_MAX_M, Math.max(ROOF_RISE_MIN_M, ROOF_RISE_PER_SHORT_SIDE * shortM)) * METERS_TO_UNITS;
    position.set(f.x, GROUND_Y + wallH, f.z);
    if (tent.width >= tent.depth) {
      scale.set(w, rise, d);
      m.compose(position, upright, scale);
    } else {
      scale.set(d, rise, w); // local X (ridge) → world Z after the 90° turn
      m.compose(position, quarterTurn, scale);
    }
    m.toArray(roofMatrices, n * 16);
  });

  const tints = new Float32Array(count * 3);
  const rand = mulberry32(0x7e47);
  for (let n = 0; n < count; n++) {
    const brightness = 0.95 + rand() * 0.05;
    const warmth = (rand() - 0.5) * 0.03; // slight shift towards sand (+) or cool grey (−)
    tints[n * 3] = brightness * (1 + warmth);
    tints[n * 3 + 1] = brightness;
    tints[n * 3 + 2] = brightness * (1 - warmth);
  }
  return { count, roofMatrices, wallMatrices, tints };
}

/** Matrices of the sanitary blocks: one box per block, scale = (width, height, depth). */
export function buildSanitaryMatrices(layout: readonly BlueprintBuilding[] = SANITARY_LAYOUT): Float32Array {
  const out = new Float32Array(layout.length * 16);
  const m = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const upright = new Quaternion();
  layout.forEach((b, n) => {
    const f = toWorldFootprint(b);
    position.set(f.x, GROUND_Y, f.z);
    scale.set(b.width * METERS_TO_UNITS, SANITARY_HEIGHT_M * METERS_TO_UNITS, b.depth * METERS_TO_UNITS);
    m.compose(position, upright, scale).toArray(out, n * 16);
  });
  return out;
}
