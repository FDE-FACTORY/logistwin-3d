import { useRef, useMemo, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
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
  // 포크는 적재/추출(HANDLING) 순간에만 뻗고 주행 중엔 접힘.
  const tForkModel = data.state === 'HANDLING' ? (cs.depth * 0.5) / s : 0;

  // 운반 팔레트 — 포크 노드에 부착(포크와 함께 접히고/뻗음). carrying 시 표시.
  const pallet = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.34, 0.6),
      new THREE.MeshStandardMaterial({ color: '#c77512', roughness: 0.8 }),
    );
    m.position.set(0, 0.28, 0.5); // 포크 타인 위(glTF +Z = 랙 방향)
    m.castShadow = true;
    m.visible = false;
    return m;
  }, []);
  useEffect(() => {
    if (!fork) return;
    fork.add(pallet);
    return () => fork.remove(pallet);
  }, [fork, pallet]);

  useFrame((_, dt) => {
    if (group.current) group.current.position.x = SMOOTH(group.current.position.x, tx, dt);
    if (carriage) carriage.position.y = SMOOTH(carriage.position.y, tyModel, dt);
    if (fork) fork.position.z = SMOOTH(fork.position.z, tForkModel, dt);
    pallet.visible = !!data.carrying;
  });

  // 상태 비콘 — 발광(블룸)으로 랙 위 크레인 위치 식별
  if (beacon?.material) {
    const c = STATE_COLOR[data.state] || theme.crane.IDLE;
    beacon.material = beacon.material.clone();
    beacon.material.emissive?.set(c);
    beacon.material.color?.set(c);
    beacon.material.emissiveIntensity = 3.5;
    beacon.material.toneMapped = false;
    beacon.scale.setScalar(1.8);
  }

  // 가시성 마스트 + 상단 비콘 — 랙 상단 위로 돌출시켜 전경/통로 어느 각도에서나 크레인 위치·상태 식별.
  // 고장(fault) 시 비콘이 적색 + 에러코드 태그로 진단 가능.
  const lv = config.levels;
  const stateColor = data.fault ? theme.alarm : STATE_COLOR[data.state] || theme.crane.IDLE;

  return (
    <group ref={group} scale={[s, s, s]}>
      <primitive object={cloned} />
      <mesh position={[0, lv * 0.58, 0]}>
        <boxGeometry args={[0.16, lv * 1.16, 0.16]} />
        <meshStandardMaterial color="#aeb7c4" metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0, lv + 1.3, 0]}>
        <sphereGeometry args={[data.fault ? 0.6 : 0.46, 18, 18]} />
        <meshStandardMaterial color={stateColor} emissive={stateColor} emissiveIntensity={data.fault ? 4.5 : 3.2} toneMapped={false} />
      </mesh>
      {data.fault && (
        <Html position={[0, lv + 2.4, 0]} center distanceFactor={42} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(229,72,77,0.92)',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: '0 0 12px rgba(229,72,77,0.6)',
            }}
          >
            ⚠ {data.id} {data.fault.code}
          </div>
        </Html>
      )}
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
