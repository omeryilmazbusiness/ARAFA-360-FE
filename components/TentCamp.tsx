"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useArafaStore } from "@/store/useArafaStore";
import { SANITARY_COUNT, buildSanitaryMatrices, buildTentBuffers } from "@/utils/campLayout";

export const TENT_MODEL_URL = "/models/tent.glb";

/** Rugged off-white canvas. */
const CANVAS_COLOR = "#e5e5e0";
const CANVAS_ROUGHNESS = 0.95;
const CANVAS_METALNESS = 0.0;

/**
 * Selection highlight: an `instanceColor` multiplier (it multiplies the canvas colour). A pale,
 * slightly luminous ice-white – cooler and a touch brighter than the warm canvas, never saturated,
 * so it reads as architectural emphasis rather than a pointer.
 */
const HIGHLIGHT_RGB = [0.82, 1.0, 1.1] as const;
/** Seconds the highlight takes to fade in / out. */
const HIGHLIGHT_FADE_S = 0.5;

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
    // Each mesh gets its own colour buffer (setColorAt writes into it); `camp.tints` stays the
    // pristine per-tent base colour that the highlight blends from and back to.
    if (roofRef.current) initInstances(roofRef.current, camp.roofMatrices, camp.count, camp.tints.slice());
    if (wallsRef.current) initInstances(wallsRef.current, camp.wallMatrices, camp.count, camp.tints.slice());
  }, [camp, geometry, walls]);

  // ── Selection highlight ────────────────────────────────────────────────────────────────────
  // Driven by a plain Zustand subscription + useFrame: selecting a tent touches two colour
  // attributes and nothing else – React (and therefore the Canvas tree) never re-renders.
  const blends = useRef(new Map<number, { t: number; target: 0 | 1 }>());
  const scratch = useRef(new THREE.Color());

  useEffect(() => {
    const retarget = (id: number | null, target: 0 | 1) => {
      if (id === null) return;
      const entry = blends.current.get(id);
      if (entry) entry.target = target;
      else if (target === 1) blends.current.set(id, { t: 0, target });
    };
    return useArafaStore.subscribe((state, prev) => {
      if (state.selectedTentId === prev.selectedTentId) return;
      retarget(prev.selectedTentId, 0);
      retarget(state.selectedTentId, 1);
    });
  }, []);

  useFrame((_, delta) => {
    const map = blends.current;
    if (map.size === 0) return;
    const roof = roofRef.current;
    const wall = wallsRef.current;
    if (!roof?.instanceColor || !wall?.instanceColor) return;

    const step = Math.min(delta, 0.1) / HIGHLIGHT_FADE_S;
    let dirty = false;
    map.forEach((entry, id) => {
      const goal = entry.target;
      if (entry.t === goal) return; // settled – nothing to write
      entry.t = goal === 1 ? Math.min(1, entry.t + step) : Math.max(0, entry.t - step);
      const k = entry.t * entry.t * (3 - 2 * entry.t); // smoothstep
      const base = camp.tints;
      scratch.current.setRGB(
        base[id * 3] + (HIGHLIGHT_RGB[0] - base[id * 3]) * k,
        base[id * 3 + 1] + (HIGHLIGHT_RGB[1] - base[id * 3 + 1]) * k,
        base[id * 3 + 2] + (HIGHLIGHT_RGB[2] - base[id * 3 + 2]) * k
      );
      roof.setColorAt(id, scratch.current);
      wall.setColorAt(id, scratch.current);
      dirty = true;
      if (entry.t === 0 && goal === 0) map.delete(id);
    });
    if (dirty) {
      roof.instanceColor.needsUpdate = true;
      wall.instanceColor.needsUpdate = true;
    }
  });

  // ── Picking ────────────────────────────────────────────────────────────────────────────────
  // R3F only fires onClick for a real click (not the end of an orbit drag).
  const onSelect = (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId === undefined) return;
    e.stopPropagation();
    useArafaStore.getState().selectTent(e.instanceId);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    document.body.style.cursor = "";
  };
  useEffect(() => onOut, []);

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
        onClick={onSelect}
        onPointerOver={onOver}
        onPointerOut={onOut}
      />
      <instancedMesh
        key={walls.uuid}
        ref={wallsRef}
        args={[walls, material, camp.count]}
        castShadow
        receiveShadow
        onClick={onSelect}
        onPointerOver={onOver}
        onPointerOut={onOut}
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
