import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { useStore } from '../store.js';
import { cellWorldFromId } from '../coords.js';
import { GRADE_COLOR } from '../config.js';

/** 통로별·면별 랙 블록 외곽(반투명 + 와이어). */
function RackBlocks({ config }) {
  const cs = config.cellSize;
  const blockW = config.baysPerSide * cs.width;
  const blockH = config.levels * cs.height;
  const blocks = [];
  for (let a = 1; a <= config.aisles; a++) {
    for (const side of ['L', 'R']) {
      const z = (a - 1) * config.aisleSpacing + (side === 'R' ? cs.depth : 0);
      blocks.push(
        <mesh key={`${a}-${side}`} position={[blockW / 2 - cs.width / 2, blockH / 2 - cs.height / 2, z]}>
          <boxGeometry args={[blockW, blockH, cs.depth * 0.92]} />
          <meshStandardMaterial color="#1e2a44" transparent opacity={0.1} />
          <Edges color="#3b4d77" />
        </mesh>,
      );
    }
  }
  return <group>{blocks}</group>;
}

/** 점유 셀 팔레트 — InstancedMesh (등급별 색). cellsVersion 변화 시 갱신. */
function Pallets({ config }) {
  const ref = useRef();
  const cells = useStore((s) => s.cells);
  const version = useStore((s) => s.cellsVersion);
  const cs = config.cellSize;
  const max = config.aisles * 2 * config.baysPerSide * config.levels;

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    cells.forEach((v, id) => {
      if (!v.occupied) return;
      const p = cellWorldFromId(config, id);
      if (!p) return;
      dummy.position.set(p.x, p.y + cs.height * 0.5, p.z);
      dummy.scale.set(cs.width * 0.8, cs.height * 0.72, cs.depth * 0.8);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(GRADE_COLOR[v.grade] || '#64748b'));
      i += 1;
    });
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [version, config, cells, cs.depth, cs.height, cs.width]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, max]} castShadow>
      <boxGeometry />
      <meshStandardMaterial roughness={0.6} />
    </instancedMesh>
  );
}

/** 입출하장(I/O) 플랫폼 표시. */
function IOStation({ config }) {
  const cs = config.cellSize;
  const depth = (config.aisles - 1) * config.aisleSpacing + cs.depth;
  return (
    <mesh position={[-cs.width, 0.06, depth / 2]}>
      <boxGeometry args={[1.6, 0.12, depth + 2]} />
      <meshStandardMaterial color="#10b981" emissive="#065f46" emissiveIntensity={0.4} />
    </mesh>
  );
}

export default function Warehouse() {
  const config = useStore((s) => s.config);
  if (!config) return null;
  return (
    <group>
      <RackBlocks config={config} />
      <Pallets config={config} />
      <IOStation config={config} />
    </group>
  );
}
