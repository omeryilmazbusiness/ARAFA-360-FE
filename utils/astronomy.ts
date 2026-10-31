/**
 * Lightweight, dependency-free sun / moon model for the Arafat map.
 *
 * This is deliberately a stylised model, not an ephemeris: the sun follows a clean
 * 24-hour arc (rises at 06:00, peaks at 12:00, sets at 18:00 local Arafat time) and
 * the moon sits exactly opposite it. That is plenty for believable lighting and
 * keeps the whole thing to a few `Math.sin` / `Math.cos` calls.
 *
 * Scene axes: +X = east, +Y = up, +Z = south (so north is -Z).
 */

/** Arafat (Mecca region) is UTC+3 all year round, no DST. */
export const ARAFAT_UTC_OFFSET_HOURS = 3;

/** Roughly Arafat's latitude (21.35°N) – tilts the arc towards the south. */
const LATITUDE_TILT_DEG = 21.35;
const MAX_ELEVATION = Math.cos((LATITUDE_TILT_DEG * Math.PI) / 180); // vertical share of the arc
const SOUTH_LEAN = Math.sin((LATITUDE_TILT_DEG * Math.PI) / 180); // horizontal share towards +Z

export type Vec3 = [number, number, number];

export type SkyState = {
  /** Local Arafat time as fractional hours in [0, 24). */
  hour: number;
  /** Normalised direction towards the sun. */
  sunDirection: Vec3;
  /** Normalised direction towards the moon (opposite the sun). */
  moonDirection: Vec3;
  /** sin(sun elevation) in [-1, 1]. > 0 means the sun is above the horizon. */
  sunElevation: number;
  /** 0 at/below the horizon -> 1 once the sun is well up. Smooth. */
  daylight: number;
  /** 0 at/above the horizon -> 1 once the moon is well up. Smooth. */
  moonlight: number;
  /** True between 06:00 and 18:00 local time. */
  isDay: boolean;
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Fractional hour (0–24) in Arafat local time for a given instant. */
export function getArafatHour(date: Date = new Date()): number {
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return (((utcHours + ARAFAT_UTC_OFFSET_HOURS) % 24) + 24) % 24;
}

/** Sun / moon state for a fractional Arafat-local hour (0–24). */
export function getSkyState(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24;

  // 06:00 -> angle 0 (east horizon), 12:00 -> π/2 (zenith), 18:00 -> π (west horizon).
  const angle = (Math.PI * (h - 6)) / 12;
  const arc = Math.sin(angle); // +1 at noon, -1 at midnight

  const sx = Math.cos(angle);
  const sy = arc * MAX_ELEVATION;
  const sz = arc * SOUTH_LEAN;
  const len = Math.hypot(sx, sy, sz) || 1;

  const sunDirection: Vec3 = [sx / len, sy / len, sz / len];
  const moonDirection: Vec3 = [-sunDirection[0], -sunDirection[1], -sunDirection[2]];
  const sunElevation = sunDirection[1];

  return {
    hour: h,
    sunDirection,
    moonDirection,
    sunElevation,
    daylight: smoothstep(0, 0.35, sunElevation),
    moonlight: smoothstep(0, 0.35, -sunElevation),
    isDay: h >= 6 && h < 18,
  };
}
