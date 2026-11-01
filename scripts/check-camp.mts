// Self-test of the blueprint tent camp (pure maths, no browser).  Run: npm run check:camp
import {
  BLUEPRINT_LAYOUT, BLUEPRINT_ORIGIN, GROUND_Y, METERS_TO_UNITS, SANITARY_COUNT, SANITARY_LAYOUT, TENT_COUNT,
  WALL_HEIGHT_M, buildSanitaryMatrices, buildTentBuffers, mountainFootprintRadius, toWorldFootprint,
} from "../utils/campLayout.ts";

let failed = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  – " + info : ""}`);
  if (!ok) failed++;
};
const U = 1 / METERS_TO_UNITS; // world units → metres
const EPS = 1e-4;

// Sizes that appear on the blueprint (short × long, metres).
const BLUEPRINT_SIZES = new Set(["15x25", "15x15", "10x20", "5x25", "15x20", "10x25", "10x10", "5x15", "10x15", "5x10", "5x20"]);

const camp = buildTentBuffers();
const again = buildTentBuffers();

check("instance count === BLUEPRINT_LAYOUT.length", camp.count === BLUEPRINT_LAYOUT.length && TENT_COUNT === BLUEPRINT_LAYOUT.length, String(camp.count));
check("matrix buffers sized count*16 / tints count*3", camp.roofMatrices.length === camp.count * 16 && camp.wallMatrices.length === camp.count * 16 && camp.tints.length === camp.count * 3);
check("deterministic", camp.roofMatrices.every((v, i) => v === again.roofMatrices[i]) && camp.tints.every((v, i) => v === again.tints[i]));
check("scale: 25x15 m tent = 1.0 x 0.6 units", Math.abs(25 * METERS_TO_UNITS - 1) < 1e-9 && Math.abs(15 * METERS_TO_UNITS - 0.6) < 1e-9);

// 1. only blueprint sizes, positive, on a 0.5 m grid
const sizeHist: Record<string, number> = {};
const badSize = BLUEPRINT_LAYOUT.filter((t) => {
  const key = `${Math.min(t.width, t.depth)}x${Math.max(t.width, t.depth)}`;
  sizeHist[key] = (sizeHist[key] ?? 0) + 1;
  return !BLUEPRINT_SIZES.has(key) || (t.x * 2) % 1 !== 0 || (t.z * 2) % 1 !== 0;
});
check("every tent is a blueprint size", badSize.length === 0, `${badSize.length} invalid`);
console.log("      size mix:", JSON.stringify(sizeHist));

// 2. matrices: scale, footprint, position, orthogonality
let badFoot = 0, badPos = 0, badRot = 0;
const wallH = WALL_HEIGHT_M * METERS_TO_UNITS;
for (let n = 0; n < camp.count; n++) {
  const w = camp.wallMatrices.subarray(n * 16, n * 16 + 16);
  const r = camp.roofMatrices.subarray(n * 16, n * 16 + 16);
  const f = toWorldFootprint(BLUEPRINT_LAYOUT[n]);
  const sx = Math.hypot(w[0], w[1], w[2]), sy = Math.hypot(w[4], w[5], w[6]), sz = Math.hypot(w[8], w[9], w[10]);
  if (Math.abs(sx - f.halfX * 2) > EPS || Math.abs(sz - f.halfZ * 2) > EPS || Math.abs(sy - wallH) > EPS) badFoot++;
  // the roof's X/Z extent after its (0° or 90°) rotation must equal the wall footprint
  if (Math.abs(Math.abs(r[0]) + Math.abs(r[8]) - f.halfX * 2) > EPS || Math.abs(Math.abs(r[2]) + Math.abs(r[10]) - f.halfZ * 2) > EPS) badFoot++;
  if (Math.abs(w[12] - f.x) > EPS || Math.abs(w[14] - f.z) > EPS || Math.abs(r[12] - f.x) > EPS || Math.abs(r[14] - f.z) > EPS) badPos++;
  if (Math.abs(w[13] - GROUND_Y) > EPS || Math.abs(r[13] - (GROUND_Y + wallH)) > EPS) badPos++;
  const ortho = (Math.abs(r[0]) < EPS) !== (Math.abs(r[2]) < EPS) && (Math.abs(r[8]) < EPS) !== (Math.abs(r[10]) < EPS);
  const wallStraight = Math.abs(w[1]) < EPS && Math.abs(w[2]) < EPS && Math.abs(w[8]) < EPS && Math.abs(w[10] - sz) < EPS;
  if (!ortho || !wallStraight) badRot++;
}
check("walls & roof match the blueprint footprint", badFoot === 0, `${badFoot} mismatches`);
check("exact x/z; walls on the ground, roof on the walls", badPos === 0, `${badPos} mismatches`);
check("strictly orthogonal (0° / 90° only)", badRot === 0, `${badRot} rotated`);

// 3. no overlaps (tents + sanitary), minimum walkway
const all = [...BLUEPRINT_LAYOUT.map((b) => ({ b, id: "tent" })), ...SANITARY_LAYOUT.map((b) => ({ b, id: "wc" }))];
let overlaps = 0, minGap = Infinity;
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const a = all[i].b, b = all[j].b;
    const g = Math.max(Math.abs(a.x - b.x) - (a.width + b.width) / 2, Math.abs(a.z - b.z) - (a.depth + b.depth) / 2);
    if (g < 0) { overlaps++; console.log(`      overlap ${all[i].id}#${i} × ${all[j].id}#${j}: ${g} m`); }
    else minGap = Math.min(minGap, g);
  }
}
check("no overlapping buildings", overlaps === 0, `${overlaps} overlaps`);
check("walkways ≥ 1 m everywhere", minGap >= 1 - 1e-9, `min gap ${minGap} m`);

// 4. alignment of the blocks: tents of equal depth in one row share the same z
const rows = new Map<string, number>();
for (const t of BLUEPRINT_LAYOUT) if (t.depth === 25 || t.depth === 20) rows.set(`${t.depth}@${t.z}`, (rows.get(`${t.depth}@${t.z}`) ?? 0) + 1);
const aligned = [...rows.values()].filter((c) => c >= 3).length;
check("macro-blocks are row-aligned", aligned >= 5, `${aligned} rows with ≥ 3 tents on the same z`);

// 5. sanitary buffer
const san = buildSanitaryMatrices();
check("sanitary matrices", san.length === SANITARY_COUNT * 16 && SANITARY_COUNT === 6, `${SANITARY_COUNT} blocks`);

// 6. mountain clearance along every outline
let minClear = Infinity;
for (const { b } of all) {
  const f = toWorldFootprint(b);
  for (let k = 0; k <= 40; k++) {
    const t = (k / 40) * 2 - 1;
    for (const s of [-1, 1]) {
      for (const [x, z] of [[f.x + s * f.halfX, f.z + t * f.halfZ], [f.x + t * f.halfX, f.z + s * f.halfZ]] as const) {
        minClear = Math.min(minClear, Math.hypot(x, z) - mountainFootprintRadius(x, z));
      }
    }
  }
}
check("mountain clearance ≥ 1 unit (25 m)", minClear >= 1, `min ${minClear.toFixed(2)} units = ${(minClear * U).toFixed(0)} m`);

const area = BLUEPRINT_LAYOUT.reduce((s, t) => s + t.width * t.depth, 0);
const xs = all.flatMap(({ b }) => [b.x - b.width / 2, b.x + b.width / 2]);
const zs = all.flatMap(({ b }) => [b.z - b.depth / 2, b.z + b.depth / 2]);
console.log(`      ${camp.count} tents, ${area} m² under canvas; plan ${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} × ${(Math.max(...zs) - Math.min(...zs)).toFixed(0)} m; origin (${BLUEPRINT_ORIGIN.x}, ${BLUEPRINT_ORIGIN.z})`);
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
