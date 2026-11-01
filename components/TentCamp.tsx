"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SANITARY_COUNT, buildSanitaryMatrices, buildTentBuffers } from "@/utils/campLayout";

export const TENT_MODEL_URL = "/models/tent.glb";

/** Rugged off-white canvas. */
const CANVAS_COLOR = "#e5e5e0";
const CANVAS_ROUGHNESS = 0.95;
const CANVAS_METALNESS = 0.0;

/**
 * `tent.glb` is a Maya export with three meshes and no materials: two identical thin pole frames
 * (`pCube20` / `pCube21` – invisible at camp scale) and the gabled canvas roof `polySurface2`.
 * The roof is the primary tent. Its node transform lost the 90° rotation that stands it up, so the
 * raw geometry has its ridge along local Y; we rotate it about Z to lay the ridge along X.
 */
const PRIMARY_MESH_NAME = "polySurface2";

/**
 * Extracts the primary tent mesh and bakes it into a UNIT geometry: ridge along X, x/z ∈ [-½, ½],
 * y ∈ [0, 1] (resting on y = 0), with flat (faceted) normals – the source has none, and shadows /
 * lighting need them. Every instance matrix then stretches this unit prism non-uniformly to the
 * tent's real width × depth (X/Z) and roof rise (Y). three.js normalises instance normals by the
 * matrix scale, so lighting stays correct under non-uniform scale.
 */
function buildTent(scene: THREE.Object3D) {
  let primary: THREE.Mesh | undefined;
  let fallback: THREE.Mesh | undefined;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    fallback ??= mesh;
    if (mesh.name === PRIMARY_MESH_NAME) primary = mesh;
  });
  const source = primary ?? fallback;
  if (!source) throw new Error("tent.glb contains no mesh");

  const geometry = source.geometry.clone();
  geometry.rotateZ(Math.PI / 2);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);

  // Faceted normals: un-index, then compute per-triangle normals. UVs are unused – drop them.
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.deleteAttribute("uv");
  faceted.computeVertexNormals();

  // Clone the exported material and tune it into rugged canvas.
  const material = (
    Array.isArray(source.material) ? source.material[0] : source.material
  ).clone() as THREE.MeshStandardMaterial;
  material.color.set(CANVAS_COLOR);
  material.roughness = CANVAS_ROUGHNESS;
  material.metalness = CANVAS_METALNESS;
  material.side = THREE.FrontSide;

  // Wall box: a unit cube on the same footprint (x/z ∈ [-½, ½]) resting on y = 0 – the instance
  // matrix gives it the exact width, depth and wall height of the tent it supports.
  const walls = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  return { geometry: faceted, walls, material };
}

/** Uploads static matrices (+ optionally the per-tent tint) to an instanced mesh. */
function initInstances(
  mesh: THREE.InstancedMesh,
  matrices: Float32Array,
  count: number,
  tints?: Float32Array
) {
  mesh.instanceMatrix.array.set(matrices);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  // Subtle per-tent canvas tint (multiplies material.color) – no extra draw call.
  if (tints) mesh.instanceColor = new THREE.InstancedBufferAttribute(tints, 3).setUsage(THREE.StaticDrawUsage);
  mesh.count = count;
  // Without this the culling sphere would only cover the single un-instanced geometry.
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
}

/** Sanitary blocks: plain, slightly cool concrete – a separate material so the canvas stays canvas. */
function createSanitaryMaterial() {
  return new THREE.MeshStandardMaterial({ color: "#aab4b8", roughness: 0.85, metalness: 0 });
}

/**
 * The tent camp: the architectural blueprint reproduced 1:1 (see utils/campLayout.ts). One roof
 * instance + one wall-box instance per blueprint tent, plus the blueprint's sanitary blocks.
 * Three InstancedMeshes; matrices are computed once, uploaded once and flagged static.
 */
export default function TentCamp() {
  const { scene } = useGLTF(TENT_MODEL_URL);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const wallsRef = useRef<THREE.InstancedMesh>(null);
  const sanitaryRef = useRef<THREE.InstancedMesh>(null);

  const { geometry, walls, material } = useMemo(() => buildTent(scene), [scene]);
  // Matrix generation: iterates BLUEPRINT_LAYOUT and applies the exact non-uniform X/Z scales.
  const camp = useMemo(() => buildTentBuffers(), []);
  const sanitaryMatrices = useMemo(() => buildSanitaryMatrices(), []);
  const sanitaryMaterial = useMemo(createSanitaryMaterial, []);

  useLayoutEffect(() => {
    if (roofRef.current) initInstances(roofRef.current, camp.roofMatrices, camp.count, camp.tints);
    if (wallsRef.current) initInstances(wallsRef.current, camp.wallMatrices, camp.count, camp.tints);
  }, [camp, geometry, walls]);

  useLayoutEffect(() => {
    if (sanitaryRef.current) initInstances(sanitaryRef.current, sanitaryMatrices, SANITARY_COUNT);
  }, [sanitaryMatrices, walls]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => walls.dispose(), [walls]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => sanitaryMaterial.dispose(), [sanitaryMaterial]);

  return (
    <>
      <instancedMesh
        // Re-created if the geometry changes (e.g. hot reload) so the instance buffer is rebuilt.
        key={geometry.uuid}
        ref={roofRef}
        args={[geometry, material, camp.count]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        key={walls.uuid}
        ref={wallsRef}
        args={[walls, material, camp.count]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        key={`${walls.uuid}-sanitary`}
        ref={sanitaryRef}
        args={[walls, sanitaryMaterial, SANITARY_COUNT]}
        castShadow
        receiveShadow
      />
    </>
  );
}

useGLTF.preload(TENT_MODEL_URL);
