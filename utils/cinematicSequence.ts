import { CatmullRomCurve3, MathUtils, Vector3 } from "three";

/**
 * Pure math for the looping four-shot cinematic sequence (no React / R3F, no allocations in the
 * per-frame path).
 *
 * World facts the shots are built around (measured from `public/models/arafat.glb` after
 * HologramMountain normalises it to a 10-unit footprint resting on y = 0):
 *   - footprint  x ∈ [-5, 5], z ∈ [-4.6, 4.6], summit plateau at y ≈ 1.8, peak y ≈ 2.8
 *   - monument   centre (-0.36, ·, 0.16), 0.35 wide, y from 1.82 (plateau) to 2.81 (tip)
 *   - main stairway climbs from the east foot (4.2, 0.4, -0.9) → (3.2, 1.0, -0.9) →
 *     (2.3, 1.4, -1.3) → (2.0, 1.5, -0.6) → (1.9, 1.8, 0.3) → plateau
 *
 * Every shot is a pure function `sample(s, out)` of its local time `s` (seconds) that writes a
 * camera position and a look-at point. Shots overlap: during the last `transition` seconds of a
 * shot its pose is cross-faded (smootherstep, C2) into the *start* pose of the next shot, which is
 * evaluated at negative local time (i.e. extrapolated backwards) so that velocity stays
 * continuous too. Position and look-at target are blended independently, so the gaze glides just
 * as smoothly as the body of the camera.
 */

export type Pose = {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
};

export type Shot = {
  /** Seconds this shot is "on air" (includes the cross-fade into the next one). */
  duration: number;
  /** Length of the cross-fade into the next shot, taken from the end of this one. */
  transition: number;
  /** Writes the pose at local time `s` (may be < 0 or > duration: smooth extrapolation). */
  sample: (s: number, out: Pose) => void;
};

export const TAU = Math.PI * 2;
export const makePose = (): Pose => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 });
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smootherstep = (t: number) => {
  const c = clamp01(t);
  return c * c * c * (c * (c * 6 - 15) + 10);
};
/** Wraps an angle (difference) into [-π, π]. */
export const wrapPi = (a: number) => a - TAU * Math.round(a / TAU);
const wrapTau = (a: number) => ((a % TAU) + TAU) % TAU;

/* ───────────────────────────── world landmarks ───────────────────────────── */

/** Monument (the pillar on the summit). `MONUMENT_MID_Y` is the middle of its visible height. */
const MONUMENT_X = -0.36;
const MONUMENT_Z = 0.16;
const MONUMENT_MID_Y = 2.3;

/** Centre of the massif (used by the wide and the high shots). */
const MOUNTAIN_CENTER_Y = 1.0;

/* ─────────────────────────── shot 2 · the ascent ─────────────────────────── */

/**
 * Camera path: hugs the main stairway (≈ 0.45–0.55 above the steps) from the east foot up to the
 * summit plateau. Clearance against the actual mesh is verified offline.
 */
const ASCENT_PATH = new CatmullRomCurve3(
  [
    new Vector3(5.6, 0.6, -0.95), // just outside the foot, at the very start of the flight
    new Vector3(4.2, 0.9, -0.95),
    new Vector3(3.25, 1.5, -0.9),
    new Vector3(2.4, 1.9, -1.3),
    new Vector3(2.0, 2.1, -0.6),
    new Vector3(1.75, 2.35, 0.3),
    new Vector3(1.3, 2.4, 0.75), // arrives on the plateau, a pillar-length from the monument
  ],
  false,
  "centripetal"
);
const ASCENT_DURATION = 13;
const ASCENT_LENGTH = ASCENT_PATH.getLength();
const ASCENT_SPEED = ASCENT_LENGTH / ASCENT_DURATION;

const _p = new Vector3();
const _t = new Vector3();

/** Gaze starts above the tip (so the monument sits in the upper frame) and settles on its middle. */
const ASCENT_GAZE_FROM = [-0.2, 3.0, 0.1] as const;
const ASCENT_GAZE_TO = [MONUMENT_X, MONUMENT_MID_Y + 0.15, MONUMENT_Z] as const;

const ascentEnd = new Vector3();
ASCENT_PATH.getPointAt(1, ascentEnd);

/* ──────────────────────── shot 3 · the summit orbit ──────────────────────── */

const SUMMIT_DURATION = 14;
const SUMMIT_ANGLE_RATE = 0.28; // rad/s → ~225° over the shot
/** Orbit starts exactly where the ascent ends (same bearing / distance / height around the pillar). */
const SUMMIT_ANGLE0 = Math.atan2(ascentEnd.x - MONUMENT_X, ascentEnd.z - MONUMENT_Z);
const SUMMIT_RADIUS0 = Math.hypot(ascentEnd.x - MONUMENT_X, ascentEnd.z - MONUMENT_Z);
const SUMMIT_RADIUS1 = 2.4;
const SUMMIT_HEIGHT0 = ascentEnd.y;
const SUMMIT_HEIGHT1 = 3.0;

function summitPose(s: number, out: Pose) {
  const a = SUMMIT_ANGLE0 + SUMMIT_ANGLE_RATE * s;
  const k = s / SUMMIT_DURATION;
  const r = SUMMIT_RADIUS0 + (SUMMIT_RADIUS1 - SUMMIT_RADIUS0) * k;
  out.px = MONUMENT_X + Math.sin(a) * r;
  out.py = SUMMIT_HEIGHT0 + (SUMMIT_HEIGHT1 - SUMMIT_HEIGHT0) * k;
  out.pz = MONUMENT_Z + Math.cos(a) * r;
  // The gaze never leaves the pillar's axis, so it stays dead-centre for the whole orbit.
  out.tx = MONUMENT_X;
  out.ty = MONUMENT_MID_Y;
  out.tz = MONUMENT_Z;
}

/* ─────────────────────── shot 4 · the high pull-back ─────────────────────── */

const PULLBACK_DURATION = 12;
const PULLBACK_RADIUS = 8.5;
const PULLBACK_HEIGHT = 17;

const summitEnd = makePose();
summitPose(SUMMIT_DURATION, summitEnd);
/** The pull-back continues radially away from the mountain along the bearing the orbit ended on. */
const PULLBACK_ANGLE = Math.atan2(summitEnd.px, summitEnd.pz);

/* ───────────────────────── shot 1 · the establishing orbit ───────────────────────── */

const ESTABLISH_DURATION = 15;
const ESTABLISH_RADIUS0 = 24;
const ESTABLISH_RADIUS_RATE = -0.3; // slow push-in while orbiting
const ESTABLISH_HEIGHT0 = 8.5;
const ESTABLISH_HEIGHT_RATE = -0.15;
/** Starts on the bearing the pull-back ended on, and ends on the bearing of the ascent's start. */
const ESTABLISH_ANGLE0 = PULLBACK_ANGLE;
const ASCENT_BEARING = Math.atan2(ASCENT_PATH.points[0].x, ASCENT_PATH.points[0].z);
const ESTABLISH_ANGLE_RATE = wrapTau(ASCENT_BEARING - ESTABLISH_ANGLE0) / ESTABLISH_DURATION;

/* ───────────────────────────────── the sequence ───────────────────────────────── */

export const SHOTS: readonly Shot[] = [
  // 1 · Establishing – wide, sweeping orbit around the whole mountain and the tactical ground.
  {
    duration: ESTABLISH_DURATION,
    transition: 5, // long, because it dollies from 20+ units out to the foot of the stairs
    sample: (s, o) => {
      const a = ESTABLISH_ANGLE0 + ESTABLISH_ANGLE_RATE * s;
      const r = ESTABLISH_RADIUS0 + ESTABLISH_RADIUS_RATE * s;
      o.px = Math.sin(a) * r;
      o.py = ESTABLISH_HEIGHT0 + ESTABLISH_HEIGHT_RATE * s;
      o.pz = Math.cos(a) * r;
      o.tx = 0;
      o.ty = MOUNTAIN_CENTER_Y;
      o.tz = 0;
    },
  },

  // 2 · The Ascent – low and close along the stairway, gaze fixed up at the summit monument.
  {
    duration: ASCENT_DURATION,
    transition: 3.5,
    sample: (s, o) => {
      if (s <= 0) {
        // Backwards extrapolation along the entry tangent (used while the previous shot blends in).
        ASCENT_PATH.getPointAt(0, _p);
        ASCENT_PATH.getTangentAt(0, _t);
        _p.addScaledVector(_t, ASCENT_SPEED * s);
      } else {
        ASCENT_PATH.getPointAt(Math.min(1, s / ASCENT_DURATION), _p);
      }
      o.px = _p.x;
      o.py = _p.y;
      o.pz = _p.z;
      const g = smootherstep(s / ASCENT_DURATION);
      o.tx = MathUtils.lerp(ASCENT_GAZE_FROM[0], ASCENT_GAZE_TO[0], g);
      o.ty = MathUtils.lerp(ASCENT_GAZE_FROM[1], ASCENT_GAZE_TO[1], g);
      o.tz = MathUtils.lerp(ASCENT_GAZE_FROM[2], ASCENT_GAZE_TO[2], g);
    },
  },

  // 3 · The Summit – slow close orbit around the monument, which stays perfectly centred.
  {
    duration: SUMMIT_DURATION,
    transition: 4,
    sample: summitPose,
  },

  // 4 · The Pull-Back – glide back and up into a high tactical view over the cyan ridges.
  {
    duration: PULLBACK_DURATION,
    transition: 5.5, // long, because it swings from the high view out to the wide orbit
    sample: (s, o) => {
      const e = smootherstep(s / PULLBACK_DURATION); // starts and ends at rest
      const endX = Math.sin(PULLBACK_ANGLE) * PULLBACK_RADIUS;
      const endZ = Math.cos(PULLBACK_ANGLE) * PULLBACK_RADIUS;
      o.px = MathUtils.lerp(summitEnd.px, endX, e);
      o.py = MathUtils.lerp(summitEnd.py, PULLBACK_HEIGHT, e);
      o.pz = MathUtils.lerp(summitEnd.pz, endZ, e);
      o.tx = MathUtils.lerp(MONUMENT_X, 0, e);
      o.ty = MathUtils.lerp(MONUMENT_MID_Y, MOUNTAIN_CENTER_Y, e);
      o.tz = MathUtils.lerp(MONUMENT_Z, 0, e);
    },
  },
];

export const SEQUENCE_DURATION = SHOTS.reduce((sum, shot) => sum + shot.duration, 0);

/** out = a → b at weight w. Position and gaze are blended independently. */
export function blendPoses(a: Pose, b: Pose, w: number, out: Pose): Pose {
  out.px = MathUtils.lerp(a.px, b.px, w);
  out.py = MathUtils.lerp(a.py, b.py, w);
  out.pz = MathUtils.lerp(a.pz, b.pz, w);
  out.tx = MathUtils.lerp(a.tx, b.tx, w);
  out.ty = MathUtils.lerp(a.ty, b.ty, w);
  out.tz = MathUtils.lerp(a.tz, b.tz, w);
  return out;
}

/**
 * Pose of the looping sequence at time `t` (seconds). `scratch` is a second pose owned by the
 * caller, so this function never allocates.
 */
export function sampleSequence(t: number, out: Pose, scratch: Pose): Pose {
  let tc = ((t % SEQUENCE_DURATION) + SEQUENCE_DURATION) % SEQUENCE_DURATION;
  let index = 0;
  while (index < SHOTS.length - 1 && tc >= SHOTS[index].duration) {
    tc -= SHOTS[index].duration;
    index++;
  }

  const shot = SHOTS[index];
  shot.sample(tc, out);

  const blendStart = shot.duration - shot.transition;
  if (tc > blendStart) {
    // The next shot is evaluated at negative local time so it *arrives* at its start pose exactly
    // as this shot's slot ends – with its own velocity, so there is no kink at the hand-over.
    SHOTS[(index + 1) % SHOTS.length].sample(tc - shot.duration, scratch);
    blendPoses(out, scratch, smootherstep((tc - blendStart) / shot.transition), out);
  }
  return out;
}
