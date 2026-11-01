// Self-test of the cinematic sequence (pure maths, no browser).  Run: npm run check:cinematic
import { SEQUENCE_DURATION, SHOTS, makePose, sampleSequence } from "../utils/cinematicSequence.ts";
import { BLUEPRINT_LAYOUT, SANITARY_LAYOUT, mountainFootprintRadius, tentHeightUnits, toWorldFootprint, SANITARY_HEIGHT_M, METERS_TO_UNITS } from "../utils/campLayout.ts";

let failed = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  – " + info : ""}`);
  if (!ok) failed++;
};

const FPS = 120;
const DT = 1 / FPS;
const pose = makePose();
const scratch = makePose();

// Shot start times (for labelling and for the region checks).
const starts: number[] = [];
SHOTS.reduce((t, s) => (starts.push(t), t + s.duration), 0);
check("six shots", SHOTS.length === 6, `${SEQUENCE_DURATION.toFixed(1)} s loop`);

const boxes = [
  ...BLUEPRINT_LAYOUT.map((b) => ({ f: toWorldFootprint(b), h: tentHeightUnits(b) })),
  ...SANITARY_LAYOUT.map((b) => ({ f: toWorldFootprint(b), h: SANITARY_HEIGHT_M * METERS_TO_UNITS })),
];

const TENT_MARGIN = 0.01; // the camera must stay at least this far outside every tent (units)
let prevPos: number[] | null = null;
let prevVel: number[] | null = null;
let prevYaw = 0, prevPitch = 0;
let nan = 0, maxSpeed = 0, maxJump = 0, maxAcc = 0, maxTurn = 0;
let minTentClear = Infinity, minTentClearAt = 0, minHeight = Infinity;
let minMountainClear = Infinity;
const t5 = starts[4]; // Skimmer start
const droneWindow = (t: number) => t >= t5 - 5.5 + 2 && t <= SEQUENCE_DURATION;
let maxSkimGlideSpeed = 0;

const total = SEQUENCE_DURATION * 2; // two full loops: also checks the loop seam
for (let t = 0; t < total; t += DT) {
  const p = sampleSequence(t, pose, scratch);
  const v = [p.px, p.py, p.pz, p.tx, p.ty, p.tz];
  if (v.some((x) => !Number.isFinite(x))) { nan++; continue; }
  const pos = [p.px, p.py, p.pz];

  if (prevPos) {
    const vel = pos.map((x, i) => (x - prevPos![i]) / DT);
    const speed = Math.hypot(vel[0], vel[1], vel[2]);
    maxSpeed = Math.max(maxSpeed, speed);
    maxJump = Math.max(maxJump, speed * DT);
    if (prevVel && t % SEQUENCE_DURATION > 0.1) maxAcc = Math.max(maxAcc, Math.hypot(vel[0] - prevVel[0], vel[1] - prevVel[1], vel[2] - prevVel[2]) / DT);
    prevVel = vel;
    if (t % SEQUENCE_DURATION >= starts[4] && t % SEQUENCE_DURATION <= SEQUENCE_DURATION) maxSkimGlideSpeed = Math.max(maxSkimGlideSpeed, speed);
  }
  prevPos = pos;

  // View direction: yaw/pitch rate (degrees/s) – a cut or a flip would show up as a spike.
  const dx = p.tx - p.px, dy = p.ty - p.py, dz = p.tz - p.pz;
  const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  if (t > 0) {
    const dyaw = Math.abs(((yaw - prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    maxTurn = Math.max(maxTurn, Math.hypot(dyaw, pitch - prevPitch) / DT);
  }
  prevYaw = yaw; prevPitch = pitch;

  const tc = t % SEQUENCE_DURATION;
  if (droneWindow(tc)) {
    minHeight = Math.min(minHeight, p.py);
    if (p.py < 3.2) minMountainClear = Math.min(minMountainClear, Math.hypot(p.px, p.pz) - mountainFootprintRadius(p.px, p.pz));
  }
  for (const { f, h } of boxes) {
    // Signed distance from the camera to the tent's box (negative = inside).
    const dxy = Math.max(Math.abs(p.px - f.x) - f.halfX, Math.abs(p.pz - f.z) - f.halfZ);
    // Outside if beyond in x/z OR above the ridge: take the larger of the two gaps.
    const clear = Math.max(dxy, p.py - h);
    if (clear < minTentClear) { minTentClear = clear; minTentClearAt = tc; }
  }
}

check("no NaN / Infinity", nan === 0);
check("camera never closer than 0.01 units to any tent or sanitary block", minTentClear >= TENT_MARGIN, `min ${minTentClear.toFixed(3)} units at t=${minTentClearAt.toFixed(1)} s`);
check("drone shots stay above 0.1 units", minHeight >= 0.1, `min y ${minHeight.toFixed(3)}`);
check("drone shots keep clear of the mountain", minMountainClear > 0.5, `min ${minMountainClear.toFixed(2)} units`);
check("drone shots never faster than the existing orbits (≤ 7 units/s)", maxSkimGlideSpeed <= 7, `${maxSkimGlideSpeed.toFixed(2)} units/s`);
check("gaze never snaps (≤ 60°/s)", maxTurn * (180 / Math.PI) <= 60, `${(maxTurn * 180 / Math.PI).toFixed(1)}°/s`);
check("velocity is continuous everywhere, loop seam included (|Δv|/dt ≤ 8 units/s²)", maxAcc <= 8, `${maxAcc.toFixed(2)} units/s²`);
console.log(`      max speed of the whole loop ${maxSpeed.toFixed(2)} units/s (the old Establishing → Ascent dolly), max step ${maxJump.toFixed(4)} units/frame @120 fps`);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
