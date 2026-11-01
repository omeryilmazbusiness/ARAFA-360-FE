"use client";

import { Suspense, type ComponentRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, Sky } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import HologramMountain from "./HologramMountain";
import TacticalGround from "./TacticalGround";
import TentCamp from "./TentCamp";
import CinematicCamera, { MAX_POLAR_ANGLE, MIN_DISTANCE } from "./CinematicCamera";
import { useArafaStore } from "@/store/useArafaStore";
import { getArafatHour, getSkyState } from "@/utils/astronomy";
import { CAMP_BOUNDS } from "@/utils/campLayout";

const NIGHT_VOID = "#020617";
const MOON_COLOR = "#93c5fd";
const LIGHT_DISTANCE = 40;
/** Sky is only drawn while the sun is (almost) above the horizon: sin(elevation) > this. */
const SKY_VISIBLE_ELEVATION = -0.1;
/** Sky's atmosphere shader fades with |sunPosition|; this mirrors three's own example scale. */
const SKY_SUN_SCALE = 450000;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const SUN_LOW = new THREE.Color("#ff9a5a"); // sunrise / sunset
const SUN_HIGH = new THREE.Color("#fff4e0"); // midday
const AMBIENT_NIGHT = new THREE.Color("#0f172a");
const AMBIENT_DAY = new THREE.Color("#cfe3ff");

/**
 * three's Sky emits linear HDR values (it relies on the renderer's tone mapping, which
 * is bypassed inside EffectComposer). Left alone those values exceed Bloom's
 * luminanceThreshold and the whole sky blooms into a white wash. This swaps the sky's
 * (no-op) tone-mapping chunk for a soft exposure curve that keeps it strictly < 1.0.
 */
type SkyMesh = ComponentRef<typeof Sky>;
const SKY_EXPOSURE = 0.9;
function compressSkyDynamicRange(sky: SkyMesh | null) {
  const material = sky?.material as THREE.ShaderMaterial | undefined;
  if (!material || material.userData.rangeCompressed) return;
  material.fragmentShader = material.fragmentShader.replace(
    "#include <tonemapping_fragment>",
    `gl_FragColor.rgb = vec3(1.0) - exp(-gl_FragColor.rgb * ${SKY_EXPOSURE.toFixed(2)});`
  );
  material.userData.rangeCompressed = true;
  material.needsUpdate = true;
}

/** Mountain bounding cylinder (world units): footprint radius and tip height, with a little slack. */
const MOUNTAIN_RADIUS = 5.6;
const MOUNTAIN_HEIGHT = 2.9;
/** Slack around the fitted shadow frustum (world units). */
const SHADOW_PADDING = 0.4;

/**
 * Fits the key light's orthographic shadow camera TIGHTLY around the mountain + the tent camp, for
 * the light's current direction. A tight frustum spends every texel of the 4096² map on what can
 * actually receive / cast a shadow (≈ 4× the density of a generic ±12 box), which is what makes the
 * tent shadows crisp. Light-space bounds are computed by projecting the corners of both volumes.
 */
const _p = new THREE.Vector3();
function fitShadowFrustum(light: THREE.DirectionalLight, position: [number, number, number]) {
  const cam = light.shadow.camera;
  cam.position.set(position[0], position[1], position[2]);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0); // the light's target is the origin
  cam.updateMatrixWorld(true);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minD = Infinity, maxD = -Infinity;
  const add = (x: number, y: number, z: number) => {
    _p.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
    minX = Math.min(minX, _p.x); maxX = Math.max(maxX, _p.x);
    minY = Math.min(minY, _p.y); maxY = Math.max(maxY, _p.y);
    minD = Math.min(minD, -_p.z); maxD = Math.max(maxD, -_p.z); // -z = distance in front of the light
  };
  const { minX: x0, maxX: x1, minZ: z0, maxZ: z1, maxHeight } = CAMP_BOUNDS;
  for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, maxHeight]) add(x, y, z);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (const y of [0, MOUNTAIN_HEIGHT]) add(Math.cos(a) * MOUNTAIN_RADIUS, y, Math.sin(a) * MOUNTAIN_RADIUS);
  }

  cam.left = minX - SHADOW_PADDING;
  cam.right = maxX + SHADOW_PADDING;
  cam.bottom = minY - SHADOW_PADDING;
  cam.top = maxY + SHADOW_PADDING;
  cam.near = Math.max(0.1, minD - SHADOW_PADDING);
  cam.far = maxD + SHADOW_PADDING;
  cam.updateProjectionMatrix();
}

type DayNightRigProps = {
  /** Fixed Arafat-local hour (0–24) for testing; omit to follow the real clock. */
  hourOverride?: number;
};

/**
 * Drives the Sky, the single shadow-casting key light (sun by day, moon by night),
 * the ambient fill and the environment from the Arafat (UTC+3) time of day.
 */
function DayNightRig({ hourOverride }: DayNightRigProps) {
  const [hour, setHour] = useState(() => hourOverride ?? getArafatHour());

  useEffect(() => {
    if (hourOverride !== undefined) {
      setHour(hourOverride);
      return;
    }
    setHour(getArafatHour());
    const id = window.setInterval(() => setHour(getArafatHour()), 10_000);
    return () => window.clearInterval(id);
  }, [hourOverride]);

  const sky = useMemo(() => getSkyState(hour), [hour]);
  const skyRef = useRef<SkyMesh>(null);

  // Publish day/night to the store so the HUD can switch palette.
  const setIsDay = useArafaStore((s) => s.setIsDay);
  useEffect(() => setIsDay(sky.isDay), [sky.isDay, setIsDay]);

  const showSky = sky.sunElevation > SKY_VISIBLE_ELEVATION;

  // Runs before the sky's first render (and again if it is re-mounted after nightfall).
  useLayoutEffect(() => {
    compressSkyDynamicRange(skyRef.current);
  }, [showSky]);

  // One key light that hands over from sun to moon as the sun crosses the horizon.
  // Its intensity is ~0 at that moment (smoothstep), so the swap is invisible.
  const useSun = sky.sunElevation >= 0;
  const keyDirection = useSun ? sky.sunDirection : sky.moonDirection;
  const keyPosition = keyDirection.map((v) => v * LIGHT_DISTANCE) as [number, number, number];
  const keyIntensity = useSun ? 3.0 * sky.daylight : 1.5 * sky.moonlight;
  const keyColor = useMemo(() => {
    if (!useSun) return new THREE.Color(MOON_COLOR);
    return SUN_LOW.clone().lerp(SUN_HIGH, smoothstep(0, 0.4, sky.sunElevation));
  }, [useSun, sky.sunElevation]);

  const lightRef = useRef<THREE.DirectionalLight>(null);
  const [kx, ky, kz] = keyPosition;
  useLayoutEffect(() => {
    if (lightRef.current) fitShadowFrustum(lightRef.current, [kx, ky, kz]);
  }, [kx, ky, kz]);

  const ambientColor = useMemo(
    () => AMBIENT_NIGHT.clone().lerp(AMBIENT_DAY, sky.daylight),
    [sky.daylight]
  );
  const ambientIntensity = 0.3 + 0.25 * sky.daylight;

  const skySunPosition = sky.sunDirection.map((v) => v * SKY_SUN_SCALE) as [
    number,
    number,
    number
  ];

  return (
    <>
      {showSky && (
        <Sky
          ref={skyRef}
          distance={800}
          sunPosition={skySunPosition}
          turbidity={6}
          rayleigh={1.2}
          mieCoefficient={0.005}
          mieDirectionalG={0.8}
        />
      )}

      <ambientLight intensity={ambientIntensity} color={ambientColor} />

      <directionalLight
        ref={lightRef}
        position={keyPosition}
        intensity={keyIntensity}
        color={keyColor}
        castShadow
        shadow-mapSize={[4096, 4096]}
        // Frustum bounds are fitted in `fitShadowFrustum` (tight around the mountain + camp).
        shadow-bias={-0.0003}
        shadow-normalBias={0.015}
      />

      {/* Dark HDRI only for subtle reflections; never rendered as the backdrop. */}
      {/* Own Suspense boundary: the HDRI comes from a CDN, so a slow download must never hold back
          the mountain, the ground or the cinematic camera. */}
      <Suspense fallback={null}>
        <Environment preset="night" environmentIntensity={0.6} />
      </Suspense>
    </>
  );
}

type MapSceneProps = DayNightRigProps;

export default function MapScene({ hourOverride }: MapSceneProps) {
  const cinematicMode = useArafaStore((s) => s.cinematicMode);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [16, 6, -10], fov: 45, near: 0.05, far: 2000 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
    >
      {/* Deep midnight void – visible whenever the Sky is not drawn (night). */}
      <color attach="background" args={[NIGHT_VOID]} />

      <Suspense fallback={null}>
        <DayNightRig hourOverride={hourOverride} />
        <HologramMountain />
        <TacticalGround />
        <TentCamp />
        {/* Inside Suspense so the sweep starts only once the mountain has loaded. */}
        <CinematicCamera />
      </Suspense>

      {/*
        Native OrbitControls behaviour (left = orbit, right = pan, wheel = zoom), no custom mappings
        or gesture code. Only protections: the camera never goes under the ground (polar limit) and
        stays between street level (0.5) and the macro view (200). CinematicCamera relaxes the polar /
        distance limits on hand-over so a cinematic view that violates them never snaps.
      */}
      <OrbitControls
        makeDefault
        enabled={!cinematicMode}
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={MAX_POLAR_ANGLE}
        minDistance={MIN_DISTANCE}
        maxDistance={200}
        // No `target` prop on purpose: CinematicCamera keeps controls.target in sync with its
        // gaze, and re-applying a fixed target on the hand-over re-render would make the view jump.
      />

      <EffectComposer multisampling={0}>
        {/* Stone stays below the threshold; only the HDR cyan edge lines bloom. */}
        <Bloom
          intensity={0.8}
          luminanceThreshold={1.0}
          luminanceSmoothing={0.1}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
