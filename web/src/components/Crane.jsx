import { useRef, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useStore } from '../store.js';
import { theme } from '../theme.js';

/**
 * 스태커 크레인 렌더 — Blender 생성 glTF(실사형) + 절차적 폴백.
 *
 * glb는 'carriage'(승강)·'fork'(신축) 노드를 분리해 두어, 서버 보간 좌표를 그 노드에
 * 매핑합니다. 미등록 제원은 절차적 모델로 폴백.
 *
 * glb 좌표: 1 레벨 = 1 모델미터, 마스트는 +Y. carriage.position.y=승강, fork.position.z=신축.
 */
const AVAILABLE_GLTF = new Set(['crane_standard.glb']);
useGLTF.preload('/models/crane_standard.glb');

const STATE_COLOR = theme.crane;

const SMOOTH = (cur, tgt, dt) => cur + (tgt - cur) * (1 - Math.pow(0.0025, Math.min(dt, 0.05)));

/** glTF 실사 모델 — carriage/fork 노드 애니메이션. */
function GltfCrane({ data, config, modelRef }) {
  const { scene } = useGLTF(`/models/${modelRef}`);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const carriage = useMemo(() => cloned.getObjectByName('carriage'), [cloned]);
  const fork = useMemo(() => cloned.getObjectByName('fork'), [cloned]);
  const beacon = useMemo(() => cloned.getObjectByName('beacon'), [cloned]);
  const group = useRef();

  const cs = config.cellSize;
  const s = cs.height; // 1 레벨 = 1 모델미터 → 스케일 = 셀 높이
  const tx = data.x * cs.width;
  const tyModel = data.z - 1; // 모델 단위(레벨)
  const tForkModel = data.state === 'HANDLING' ? (cs.depth * 0.55) / s : 0;

  useFrame((_, dt) => {
    if (group.current) group.current.position.x = SMOOTH(group.current.position.x, tx, dt);
    if (carriage) carriage.position.y = SMOOTH(carriage.position.y, tyModel, dt);
    if (fork) fork.position.z = SMOOTH(fork.position.z, tForkModel, dt);
  });

  // 상태 비콘 색
  if (beacon?.material) {
    const c = STATE_COLOR[data.state] || theme.crane.IDLE;
    beacon.material = beacon.material.clone();
    beacon.material.emissive?.set(c);
    beacon.material.color?.set(c);
  }

  return (
    <group ref={group} scale={[s, s, s]}>
      <primitive object={cloned} />
    </group>
  );
}

/** 절차적 상세 모델 (폴백). */
function ProceduralCrane({ data, config }) {
  const dims = useStore((st) => st.craneModelInfo?.dimensions);
  const group = useRef();
  const carriage = useRef();
  const fork = useRef();

  const cs = config.cellSize;
  const tx = data.x * cs.width;
  const ty = (data.z - 1) * cs.height;
  const tFork = data.state === 'HANDLING' ? cs.depth * 0.55 : 0;
  const mastH = dims?.mastHeightM || config.levels * cs.height + 1;
  const stateColor = STATE_COLOR[data.state] || '#94a3b8';

  useFrame((_, dt) => {
    if (group.current) group.current.position.x = SMOOTH(group.current.position.x, tx, dt);
    if (carriage.current) carriage.current.position.y = SMOOTH(carriage.current.position.y, ty, dt);
    if (fork.current) fork.current.position.z = SMOOTH(fork.current.position.z, tFork, dt);
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.7, 0.4, cs.depth * 1.6]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, mastH / 2, 0]} castShadow>
        <boxGeometry args={[0.28, mastH, 0.28]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, mastH + 0.35, 0]}>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshStandardMaterial color={stateColor} emissive={stateColor} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <group ref={carriage} position={[0, ty, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.55, 0.45, cs.depth * 0.9]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
        <group ref={fork} position={[0, 0, tFork]}>
          <mesh position={[0, -0.12, cs.depth * 0.5]}>
            <boxGeometry args={[0.5, 0.1, cs.depth]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          {data.carrying && (
            <mesh position={[0, 0.18, cs.depth * 0.55]} castShadow>
              <boxGeometry args={[cs.width * 0.7, cs.height * 0.5, cs.depth * 0.7]} />
              <meshStandardMaterial color="#d97706" />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

export default function Crane({ data }) {
  const config = useStore((s) => s.config);
  const modelRef = useStore((s) => s.craneModelInfo?.modelRef);
  const cs = config.cellSize;
  const baseZ = (data.aisle - 1) * config.aisleSpacing + cs.depth / 2;
  const useReal = modelRef && AVAILABLE_GLTF.has(modelRef);

  return (
    <group position={[0, 0, baseZ]}>
      {useReal ? (
        <Suspense fallback={<ProceduralCrane data={data} config={config} />}>
          <GltfCrane data={data} config={config} modelRef={modelRef} />
        </Suspense>
      ) : (
        <ProceduralCrane data={data} config={config} />
      )}
    </group>
  );
}
