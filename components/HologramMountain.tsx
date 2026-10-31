"use client";

import { useEffect, useMemo } from "react";
import { Edges, useGLTF } from "@react-three/drei";
import * as THREE from "three";

export const MOUNTAIN_MODEL_URL = "/models/arafat.glb";

/** Longest edge of the mountain in world units after normalisation. */
const TARGET_SIZE = 10;

/** Natural desert stone PBR surface. */
const TERRAIN_COLOR = "#816a4b"; // natural desert stone (r .506 g .416 b .294)
const TERRAIN_ROUGHNESS = 0.6;
const TERRAIN_METALNESS = 0.1;

const EDGE_COLOR = "#22d3ee"; // electric cyan
const EDGE_THRESHOLD = 40; // degrees – only major structural / ridge lines get drawn
/**
 * Bloom operates on linear HDR values and `toneMapped={false}` has no effect inside
 * a post-processing pipeline, so the edge colour is multiplied above 1.0. That is
 * what lets the lines (and only the lines) clear Bloom's luminanceThreshold.
 */
const EDGE_INTENSITY = 3;

type BakedModel = {
  geometries: THREE.BufferGeometry[];
  scale: number;
  position: [number, number, number];
};

/**
 * Flattens every mesh in the GLTF scene into world-space geometry, then computes
 * the scale / offset that fits the whole model into TARGET_SIZE, centred on X/Z
 * with its base resting on y = 0.
 */
function bakeModel(scene: THREE.Object3D): BakedModel {
  scene.updateMatrixWorld(true);

  const geometries: THREE.BufferGeometry[] = [];
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    geometries.push(geometry);
  });

  const box = new THREE.Box3();
  geometries.forEach((g) => g.boundingBox && box.union(g.boundingBox));

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = TARGET_SIZE / Math.max(size.x, size.y, size.z);

  return {
    geometries,
    scale,
    position: [-center.x * scale, -box.min.y * scale, -center.z * scale],
  };
}

export default function HologramMountain() {
  const { scene } = useGLTF(MOUNTAIN_MODEL_URL);

  const { geometries, scale, position } = useMemo(() => bakeModel(scene), [scene]);

  // One shared terrain material. polygonOffset pushes the surface back slightly so
  // the edge lines drawn exactly on it don't z-fight.
  const terrainMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: TERRAIN_COLOR,
        roughness: TERRAIN_ROUGHNESS,
        metalness: TERRAIN_METALNESS,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    []
  );

  const edgeColor = useMemo(
    () => new THREE.Color(EDGE_COLOR).multiplyScalar(EDGE_INTENSITY),
    []
  );

  // Dispose baked geometry / material when the model unmounts.
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  useEffect(() => () => terrainMaterial.dispose(), [terrainMaterial]);

  return (
    <group position={position} scale={scale}>
      {geometries.map((geometry, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={terrainMaterial}
          castShadow
          receiveShadow
          frustumCulled={false}
        >
          <Edges
            color={edgeColor}
            threshold={EDGE_THRESHOLD}
            toneMapped={false}
            lineWidth={1}
          />
        </mesh>
      ))}
    </group>
  );
}

useGLTF.preload(MOUNTAIN_MODEL_URL);
