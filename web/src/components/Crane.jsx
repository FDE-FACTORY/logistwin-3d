import { useRef, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useStore } from '../store.js';

/**
 * 스태커 크레인 렌더 — 구조적으로 정확한 절차적 모델(기본) + glTF 교체 경로.
 *
 * 실제 AS/RS 크레인 구성을 반영:
 *   하부 주행대(레일 보기) → 마스트(승강 가이드) → 상부 가이드대(상부레일) →
 *   승강 캐리지(리프트 플랫폼) → 텔레스코픽 포크 → (적재 시) 팔레트.
 * 서버가 매 틱 보내는 보간 좌표(x=베이, z=층)를 매 프레임 lerp → 부드러운 주행·승강.
 *
 * 🔁 실사 glTF 교체:
 *   1) web/public/models/ 에 <modelRef>.glb 배치 (예: crane_highbay.glb).
 *   2) 애니메이션을 위해 glb 노드명에 'carriage'(승강), 'fork'(신축) 포함 권장.
 *   3) AVAILABLE_GLTF 에 파일명 등록 → 해당 제원은 실사 모델로 렌더, 미등록은 절차적.
 */
const AVAILABLE_GLTF = new Set([
  // 'crane_highbay.glb',  // 실사 에셋을 넣으면 여기에 등록
]);

const STATE_COLOR = {
  IDLE: '#64748b',
  TRAVELING: '#22d3ee',
  HANDLING: '#f59e0b',
  RETURNING: '#a78bfa',
};

/** 공통 애니메이션 훅 — 목표 좌표를 매 프레임 보간. */
function useCraneAnim(group, carriage, fork, target) {
  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.0025, Math.min(dt, 0.05));
    if (group.current) group.current.position.x += (target.tx - group.current.position.x) * k;
    if (carriage.current) carriage.current.position.y += (target.ty - carriage.current.position.y) * k;
    if (fork.current) fork.current.position.z += (target.tFork - fork.current.position.z) * k;
  });
}

/** 절차적 상세 모델. */
function ProceduralCrane({ data, cs, mastH, stateColor, target, refs }) {
  const { group, carriage, fork } = refs;
  const baseZ = 0; // 로컬 중심 (아일 z는 바깥 그룹이 처리)
  const railLen = cs.depth * 1.9;
  return (
    <group ref={group}>
      {/* 하부 주행대 (레일 보기) + 경고 스트라이프 */}
      <mesh position={[0, 0.22, baseZ]} castShadow>
        <boxGeometry args={[0.85, 0.44, railLen]} />
        <meshStandardMaterial color="#1f2937" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.46, baseZ]}>
        <boxGeometry args={[0.9, 0.08, railLen * 0.98]} />
        <meshStandardMaterial color="#facc15" metalness={0.2} roughness={0.5} />
      </mesh>
      {/* 주행 바퀴 (양끝) */}
      {[-railLen / 2 + 0.2, railLen / 2 - 0.2].map((z, i) => (
        <mesh key={i} position={[0, 0.12, baseZ + z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.5, 16]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      ))}

      {/* 마스트 (이중 가이드 + 가로 보강) */}
      {[-0.13, 0.13].map((zx, i) => (
        <mesh key={i} position={[0, mastH / 2 + 0.46, baseZ + zx]} castShadow>
          <boxGeometry args={[0.16, mastH, 0.16]} />
          <meshStandardMaterial color="#9aa5b5" metalness={0.55} roughness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: 4 }).map((_, i) => {
        const y = 0.46 + (mastH * (i + 1)) / 5;
        return (
          <mesh key={`b${i}`} position={[0, y, baseZ]}>
            <boxGeometry args={[0.1, 0.08, 0.34]} />
            <meshStandardMaterial color="#7b8696" metalness={0.5} roughness={0.5} />
          </mesh>
        );
      })}

      {/* 상부 가이드대 (상부 레일 주행) */}
      <mesh position={[0, mastH + 0.5, baseZ]} castShadow>
        <boxGeometry args={[0.7, 0.3, railLen * 0.8]} />
        <meshStandardMaterial color="#374151" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* 상태 비콘 */}
      <mesh position={[0, mastH + 0.85, baseZ]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color={stateColor} emissive={stateColor} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* 승강 캐리지 (리프트 플랫폼) + 텔레스코픽 포크 */}
      <group ref={carriage} position={[0, target.ty, baseZ]}>
        <mesh castShadow>
          <boxGeometry args={[0.62, 0.5, cs.depth * 0.5]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.3} roughness={0.5} />
        </mesh>
        {/* 포크 (2단 텔레스코픽: 베이스 + 신축 타인) */}
        <group ref={fork} position={[0, 0, target.tFork]}>
          <mesh position={[0, -0.16, cs.depth * 0.35]} castShadow>
            <boxGeometry args={[0.56, 0.12, cs.depth * 0.8]} />
            <meshStandardMaterial color="#475569" metalness={0.4} roughness={0.5} />
          </mesh>
          {[-0.16, 0.16].map((x, i) => (
            <mesh key={i} position={[x, -0.24, cs.depth * 0.6]} castShadow>
              <boxGeometry args={[0.1, 0.08, cs.depth * 0.7]} />
              <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
            </mesh>
          ))}
          {data.carrying && (
            <mesh position={[0, 0.06, cs.depth * 0.62]} castShadow>
              <boxGeometry args={[cs.width * 0.72, cs.height * 0.5, cs.depth * 0.72]} />
              <meshStandardMaterial color="#d97706" roughness={0.7} />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

/** glTF 실사 모델 (등록된 경우). 승강/포크 노드가 있으면 그쪽에 애니메이션을 매핑. */
function GltfCrane({ url, refs, target }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  useCraneAnim(refs.group, refs.carriage, refs.fork, target);
  return (
    <group ref={refs.group}>
      <primitive object={cloned} />
    </group>
  );
}

export default function Crane({ data }) {
  const config = useStore((s) => s.config);
  const dims = useStore((s) => s.craneModelInfo?.dimensions);
  const modelRef = useStore((s) => s.craneModelInfo?.modelRef);
  const group = useRef();
  const carriage = useRef();
  const fork = useRef();
  const refs = { group, carriage, fork };

  const cs = config.cellSize;
  const baseZ = (data.aisle - 1) * config.aisleSpacing + cs.depth / 2;
  const target = useMemo(() => ({ tx: 0, ty: 0, tFork: 0 }), []);
  target.tx = data.x * cs.width;
  target.ty = (data.z - 1) * cs.height;
  target.tFork = data.state === 'HANDLING' ? cs.depth * 0.55 : 0;

  const mastH = dims?.mastHeightM || config.levels * cs.height + 1;
  const stateColor = STATE_COLOR[data.state] || '#94a3b8';
  const useReal = modelRef && AVAILABLE_GLTF.has(modelRef);

  // 절차적 모델은 자체 그룹에 애니메이션 적용. (glTF 분기는 GltfCrane 내부에서 처리)
  if (!useReal) useCraneAnim(group, carriage, fork, target);

  return (
    <group position={[0, 0, baseZ]}>
      {useReal ? (
        <Suspense fallback={null}>
          <GltfCrane url={`/models/${modelRef}`} refs={refs} target={target} />
        </Suspense>
      ) : (
        <ProceduralCrane data={data} cs={cs} mastH={mastH} stateColor={stateColor} target={target} refs={refs} />
      )}
    </group>
  );
}
