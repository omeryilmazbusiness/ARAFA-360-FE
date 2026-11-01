"use client";

import { useEffect, useMemo } from "react";
import { Grid } from "@react-three/drei";
import * as THREE from "three";

/** Radius of the Plain of Arafat disc in world units (mountain is ~10 units wide). */
const GROUND_RADIUS = 100;
const GROUND_SEGMENTS = 96;

/** Desert stone base – identical hue to the mountain so the two read as one landmass. */
const GROUND_COLOR = "#816a4b";

/** Fraction of the radius that stays fully opaque before the fade towards the void begins. */
const FADE_START = 0.2;
const FADE_END = 1.0;

const GRID_CELL_COLOR = "#22d3ee";
const GRID_SECTION_COLOR = "#0ea5e9";

/**
 * Injects a radial alpha falloff into a MeshStandardMaterial. The distance is measured in the
 * disc's local XY (the circle geometry is built in the XY plane, then rotated flat), so it costs a
 * single varying + one smoothstep per fragment – no textures, no extra passes.
 */
function applyRadialFade(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uFadeRadius = { value: GROUND_RADIUS };
  shader.uniforms.uFadeStart = { value: FADE_START };
  shader.uniforms.uFadeEnd = { value: FADE_END };

  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec2 vGroundLocal;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroundLocal = position.xy;");

  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
varying vec2 vGroundLocal;
uniform float uFadeRadius;
uniform float uFadeStart;
uniform float uFadeEnd;`
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
{
  float groundDist = length(vGroundLocal) / uFadeRadius;
  float groundFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, groundDist);
  // Squared falloff keeps the rim imperceptible against the night void.
  diffuseColor.a *= groundFade * groundFade;
}`
    );
}

/**
 * Vast desert plain under the mountain: catches the key light's shadows (so the mountain is
 * grounded), fades radially into the void, and carries a holographic tactical grid.
 */
export default function TacticalGround() {
  const geometry = useMemo(
    () => new THREE.CircleGeometry(GROUND_RADIUS, GROUND_SEGMENTS),
    []
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group position={[0, 0, 0]}>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow={false}
        renderOrder={-1}
      >
        <meshStandardMaterial
          color={GROUND_COLOR}
          roughness={1.0}
          metalness={0}
          transparent
          depthWrite={false}
          onBeforeCompile={applyRadialFade}
        />
      </mesh>

      <Grid
        position={[0, 0.01, 0]}
        renderOrder={0}
        infiniteGrid
        cellSize={1}
        sectionSize={5}
        cellColor={GRID_CELL_COLOR}
        sectionColor={GRID_SECTION_COLOR}
        cellThickness={0.6}
        sectionThickness={1.2}
        fadeDistance={50}
        fadeStrength={1.5}
      />
    </group>
  );
}
