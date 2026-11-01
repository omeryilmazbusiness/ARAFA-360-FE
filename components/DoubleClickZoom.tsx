"use client";

import { type ComponentRef, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls } from "@react-three/drei";
import { easing } from "maath";
import * as THREE from "three";
import { useArafaStore } from "@/store/useArafaStore";

/** Each double-click moves the camera this fraction of the way to its target (0.6 → 40 % closer). */
const ZOOM_FACTOR = 0.6;
/** Smoothing time (s) of the dive: ≈ 95 % of the distance is covered in 3× this. */
const SMOOTH_TIME = 0.25;
/** Stop animating once the distance is this close to the goal. */
const SETTLE_EPS = 1e-3;

/**
 * Double-click = glide closer to the orbit target (depth / "Z" zoom).
 *
 * The listener sits on the canvas element, the glide runs in `useFrame` with `maath` damping and
 * moves the camera along its line of sight to the target, so the view direction never changes.
 * The goal is clamped to the controls' own `minDistance` / `maxDistance`. Any wheel or pointer
 * input cancels a running glide, so the user is never fighting the animation.
 *
 * No React state, no per-frame allocations.
 */
export default function DoubleClickZoom() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as ComponentRef<typeof OrbitControls> | null;

  const goal = useRef<number | null>(null);
  const scratch = useRef({ d: 0 });
  const offset = useRef(new THREE.Vector3());

  useEffect(() => {
    const el = gl.domElement;
    const onDoubleClick = () => {
      if (!controls || !controls.enabled || useArafaStore.getState().cinematicMode) return;
      const current = camera.position.distanceTo(controls.target);
      goal.current = THREE.MathUtils.clamp(current * ZOOM_FACTOR, controls.minDistance, controls.maxDistance);
    };
    const cancel = () => {
      goal.current = null;
    };
    el.addEventListener("dblclick", onDoubleClick);
    el.addEventListener("pointerdown", cancel);
    el.addEventListener("wheel", cancel, { passive: true });
    return () => {
      el.removeEventListener("dblclick", onDoubleClick);
      el.removeEventListener("pointerdown", cancel);
      el.removeEventListener("wheel", cancel);
    };
  }, [gl, camera, controls]);

  useFrame((_, delta) => {
    const target = goal.current;
    if (target === null || !controls || !controls.enabled) return;

    const o = offset.current.copy(camera.position).sub(controls.target);
    const current = o.length();
    if (current < 1e-6) {
      goal.current = null;
      return;
    }

    scratch.current.d = current;
    easing.damp(scratch.current, "d", target, SMOOTH_TIME, Math.min(delta, 0.1));
    const next = scratch.current.d;
    camera.position.copy(controls.target).addScaledVector(o, next / current);

    if (Math.abs(next - target) < SETTLE_EPS) goal.current = null;
  });

  return null;
}
