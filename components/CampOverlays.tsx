"use client";

import { memo, useMemo } from "react";
import { Text } from "@react-three/drei";
import { BLUEPRINT_LAYOUT, tentHeightUnits, toWorldFootprint } from "@/utils/campLayout";

/**
 * AR-style visual aid for the tent camp: a number above every tent. Static WebGL (troika SDF
 * text) – no DOM, no per-frame work, no React state.
 */

// ── Tent numbers ──────────────────────────────────────────────────────────────────────────────
/** Clean sans-serif (Geist, shipped with the app). troika can't read woff2, hence the woff copy. */
const LABEL_FONT = "/fonts/Geist.woff";
const LABEL_SIZE = 0.16; // world units ≈ 4 m tall digits – a 15 m wide tent stays uncluttered
const LABEL_LIFT = 0.1; // above the ridge, ≈ 2.5 m
const LABEL_COLOR = "#e2e8f0";

/**
 * Flat, upward-facing numbers hovering above each ridge: they stay a constant real-world size
 * (like painted ground markings on a plan) and never fight the tents for screen space the way
 * camera-facing sprites do. Digits only → troika builds a tiny shared SDF atlas for all 60.
 */
export const TentLabels = memo(function TentLabels() {
  const labels = useMemo(
    () =>
      BLUEPRINT_LAYOUT.map((tent) => {
        const f = toWorldFootprint(tent);
        return {
          no: tent.no,
          position: [f.x, tentHeightUnits(tent) + LABEL_LIFT, f.z] as [number, number, number],
        };
      }),
    [],
  );

  return (
    <group name="tent-labels">
      {labels.map(({ no, position }) => (
        <Text
          key={no}
          position={position}
          rotation={[-Math.PI / 2, 0, 0]}
          font={LABEL_FONT}
          fontSize={LABEL_SIZE}
          color={LABEL_COLOR}
          fillOpacity={0.6}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.04}
          sdfGlyphSize={32}
          // Overlay: never writes depth, ignores tone mapping so it stays a crisp UI-white.
          material-toneMapped={false}
          material-depthWrite={false}
          raycast={() => null}
        >
          {no}
        </Text>
      ))}
    </group>
  );
});
