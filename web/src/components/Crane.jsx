import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store.js';

/**
 * 절차적 스태커 크레인 — 베이스(레일 주행)·마스트·캐리지(승강)·포크·팔레트.
 * 서버가 매 틱 보내는 보간 좌표(x=베이, z=층)를 목표로 매 프레임 lerp → 부드러운 동작.
 *
 * 🔁 glTF 교체 훅: 추후 web/public/models/<modelRef> 에 실사 .glb를 넣고 아래 GLTF_MODELS에
 *    등록하면 절차적 메시 대신 해당 모델을 렌더하도록 확장 가능 (현재는 절차적 기본).
 */
const GLTF_MODELS = {}; // 예: { 'crane_highbay.glb': true } — 등록 시 useGLTF 로 로드

const STATE_COLOR = {
  IDLE: '#64748b',
  TRAVELING: '#22d3ee',
  HANDLING: '#f59e0b',
  RETURNING: '#a78bfa',
};

export default function Crane({ data }) {
  const config = useStore((s) => s.config);
  const dims = useStore((s) => s.craneModelInfo?.dimensions);
  const group = useRef();
  const carriage = useRef();
  const fork = useRef();

  const cs = config.cellSize;
  const baseZ = (data.aisle - 1) * config.aisleSpacing + cs.depth / 2;
  const tx = data.x * cs.width;
  const ty = (data.z - 1) * cs.height;
  const tFork = data.state === 'HANDLING' ? cs.depth * 0.55 : 0;

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.002, Math.min(dt, 0.05)); // 프레임 독립 보간
    if (group.current) group.current.position.x += (tx - group.current.position.x) * k;
    if (carriage.current) carriage.current.position.y += (ty - carriage.current.position.y) * k;
    if (fork.current) fork.current.position.z += (tFork - fork.current.position.z) * k;
  });

  const mastH = dims?.mastHeightM || config.levels * cs.height + 1;
  const stateColor = STATE_COLOR[data.state] || '#94a3b8';

  // (glTF 등록 시 여기서 분기) — 현재는 절차적 모델.
  void GLTF_MODELS;

  return (
    <group ref={group} position={[tx, 0, baseZ]}>
      {/* 베이스 (레일 주행) */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.7, 0.4, cs.depth * 1.6]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* 마스트 */}
      <mesh position={[0, mastH / 2, 0]} castShadow>
        <boxGeometry args={[0.28, mastH, 0.28]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* 상태 표시등 */}
      <mesh position={[0, mastH + 0.35, 0]}>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshStandardMaterial color={stateColor} emissive={stateColor} emissiveIntensity={0.9} />
      </mesh>
      {/* 캐리지 (승강) + 포크 */}
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
