"use client";

import { type ComponentRef, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useArafaStore } from "@/store/useArafaStore";
import {
  clamp01,
  makePose,
  sampleSequence,
  smootherstep,
  wrapPi,
  type Pose,
} from "@/utils/cinematicSequence";

/** Keeps the manual camera above the ground plane (tilt limit). */
export const MAX_POLAR_ANGLE = Math.PI / 2 - 0.05;
/** Closest the manual camera may get to its target (units; 1 unit = 25 m). */
export const MIN_DISTANCE = 0.5;
/** How fast (1/s) the polar / distance limits are re-imposed after a hand-over that violates them. */
const POLAR_RELAX_RATE = 1.5;

/** Seconds to ease in from wherever the camera currently is (e.g. after manual control). */
const ENTRY_DURATION = 3;

/**
 * Plays the looping four-shot sequence from `utils/cinematicSequence`:
 *   1 Establishing orbit → 2 The Ascent (stairway) → 3 The Summit (monument orbit) → 4 The Pull-Back.
 *
 * Renders nothing. Both the camera position and its look-at target are driven by the sequence
 * (cross-faded with smootherstep between shots, see the module for the details).
 *
 * Hand-off: the cinematic flag is read straight from the store *inside* the frame callback, so
 * the very next frame after `takeControl()` the sequence stops writing. Every frame it has written
 * the exact camera pose *and* `controls.target`, so OrbitControls takes over from the identical
 * view. Resuming eases in from the user's current view (no cut, no tunnelling through the mountain).
 *
 * Performance: pure math on pre-allocated scratch objects – zero allocations per frame.
 */
export default function CinematicCamera() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as ComponentRef<typeof OrbitControls> | null;

  // Sequence clock: seqTime = clock.elapsedTime - offset. The offset absorbs the time spent in
  // manual mode and long stalls (hidden tab), so the sequence resumes where it stopped.
  const offset = useRef(0);
  const seqTime = useRef(0);
  const wasActive = useRef(false);
  const hasEverRun = useRef(false);

  // Ease-in from the pre-existing camera pose (cylindrical around the mountain's axis).
  const entryActive = useRef(false);
  const entryStart = useRef(0); // seqTime at which the ease-in began
  const entryFromAngle = useRef(0);
  const entryFromRadius = useRef(0);
  const entryAngleOffset = useRef<number | null>(null); // whole turns + short-way offset, set once
  const entryToAngle = useRef(0); // unwrapped (continuous) angle of the sequence's position
  const entryFrom = useRef(makePose());

  // Scratch poses – nothing is allocated inside the frame loop.
  const pose = useRef(makePose());
  const scratch = useRef(makePose());
  const eased = useRef(makePose());

  // The cinematic owns the camera with OrbitControls disabled, so the first touch of the canvas
  // (press or wheel) hands the view to the user – otherwise the scene feels "locked" until the
  // Take-control pill is found. The gesture that triggers it only hands over; the next one navigates.
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const handOver = () => {
      if (useArafaStore.getState().cinematicMode) useArafaStore.getState().takeControl();
    };
    el.addEventListener("pointerdown", handOver, { passive: true });
    el.addEventListener("wheel", handOver, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", handOver);
      el.removeEventListener("wheel", handOver);
    };
  }, [gl]);

  useFrame((state, delta) => {
    if (!useArafaStore.getState().cinematicMode) {
      if (controls) {
        if (wasActive.current) {
          // Hand-over: shots such as the Ascent look UP at their target, i.e. sit beyond the polar
          // limit. Start from the current tilt and tighten the limit gradually instead of snapping.
          controls.maxPolarAngle = Math.max(MAX_POLAR_ANGLE, controls.getPolarAngle());
          // Same for the zoom limit: the close summit / ascent views sit nearer than MIN_DISTANCE.
          controls.minDistance = Math.min(MIN_DISTANCE, controls.getDistance());
        }
        if (controls.minDistance < MIN_DISTANCE) {
          controls.minDistance = THREE.MathUtils.damp(controls.minDistance, MIN_DISTANCE, POLAR_RELAX_RATE, delta);
          if (MIN_DISTANCE - controls.minDistance < 1e-3) controls.minDistance = MIN_DISTANCE;
        }
        if (controls.maxPolarAngle > MAX_POLAR_ANGLE) {
          controls.maxPolarAngle = THREE.MathUtils.damp(controls.maxPolarAngle, MAX_POLAR_ANGLE, POLAR_RELAX_RATE, delta);
          if (controls.maxPolarAngle - MAX_POLAR_ANGLE < 1e-3) controls.maxPolarAngle = MAX_POLAR_ANGLE;
        }
      }
      wasActive.current = false;
      return;
    }

    // `.elapsedTime` (not `getElapsedTime()`): the latter calls getDelta() and would steal time
    // from R3F's own per-frame delta.
    const elapsed = state.clock.elapsedTime;

    if (!wasActive.current) {
      // (Re)activation: continue the sequence from where it stopped.
      offset.current = elapsed - seqTime.current;
      wasActive.current = true;

      if (hasEverRun.current) {
        // Capture the camera's current view so we can ease in from it instead of cutting.
        const p = camera.position;
        const from = entryFrom.current;
        from.py = p.y;
        from.tx = controls?.target.x ?? 0;
        from.ty = controls?.target.y ?? 1;
        from.tz = controls?.target.z ?? 0;
        entryFromAngle.current = Math.atan2(p.x, p.z);
        entryFromRadius.current = Math.hypot(p.x, p.z);
        entryActive.current = true;
        entryStart.current = seqTime.current;
        entryAngleOffset.current = null; // resolved on the first blended frame
      }
      hasEverRun.current = true;
    } else if (delta > 0.1) {
      // Long stall (tab was hidden): don't let the sequence skip ahead.
      offset.current += delta - 1 / 60;
    }

    seqTime.current = elapsed - offset.current;
    let current: Pose = sampleSequence(seqTime.current, pose.current, scratch.current);

    if (entryActive.current) {
      const w = clamp01((seqTime.current - entryStart.current) / ENTRY_DURATION);
      if (w >= 1) {
        entryActive.current = false;
      } else {
        const from = entryFrom.current;
        const toAngleRaw = Math.atan2(current.px, current.pz);
        if (entryAngleOffset.current === null) {
          // Pick the short way round once, then keep the target angle continuous (unwrapped).
          entryToAngle.current = toAngleRaw;
          entryAngleOffset.current =
            entryFromAngle.current + wrapPi(toAngleRaw - entryFromAngle.current) - toAngleRaw;
        } else {
          entryToAngle.current += wrapPi(toAngleRaw - entryToAngle.current);
        }

        // Cylindrical blend of the position (so the camera orbits round the mountain instead of
        // flying through it); the gaze is blended linearly.
        const e = smootherstep(w);
        const angle = THREE.MathUtils.lerp(
          entryFromAngle.current,
          entryToAngle.current + entryAngleOffset.current,
          e
        );
        const radius = THREE.MathUtils.lerp(entryFromRadius.current, Math.hypot(current.px, current.pz), e);
        const out = eased.current;
        out.px = Math.sin(angle) * radius;
        out.pz = Math.cos(angle) * radius;
        out.py = THREE.MathUtils.lerp(from.py, current.py, e);
        out.tx = THREE.MathUtils.lerp(from.tx, current.tx, e);
        out.ty = THREE.MathUtils.lerp(from.ty, current.ty, e);
        out.tz = THREE.MathUtils.lerp(from.tz, current.tz, e);
        current = out;
      }
    }

    camera.position.set(current.px, current.py, current.pz);
    camera.lookAt(current.tx, current.ty, current.tz);

    // Keep OrbitControls pointed at what we are looking at, so the hand-over has no jump.
    controls?.target.set(current.tx, current.ty, current.tz);
  });

  return null;
}
