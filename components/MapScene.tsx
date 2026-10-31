"use client";

import { Suspense, type ComponentRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, Sky } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import HologramMountain from "./HologramMountain";
import { getArafatHour, getSkyState } from "@/utils/astronomy";

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
        position={keyPosition}
        intensity={keyIntensity}
        color={keyColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />

      {/* Dark HDRI only for subtle reflections; never rendered as the backdrop. */}
      <Environment preset="night" environmentIntensity={0.6} />
    </>
  );
}

type MapSceneProps = DayNightRigProps;

export default function MapScene({ hourOverride }: MapSceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [16, 6, -10], fov: 45, near: 0.1, far: 2000 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
    >
      {/* Deep midnight void – visible whenever the Sky is not drawn (night). */}
      <color attach="background" args={[NIGHT_VOID]} />

      <Suspense fallback={null}>
        <DayNightRig hourOverride={hourOverride} />
        <HologramMountain />
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan
        minDistance={4}
        maxDistance={40}
        target={[0, 2, 0]}
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
