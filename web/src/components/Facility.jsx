import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { useStore } from '../store.js';
import { theme } from '../theme.js';
import { useTiled } from '../useTiled.js';

useGLTF.preload('/models/truck.glb');

const lerp = (c, t, k) => c + (t - c) * k;

/** 3D 구역 라벨 (DOM 오버레이). */
function ZoneLabel({ pos, text, color }) {
  return (
    <Html position={pos} center distanceFactor={46} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: 'rgba(13,17,23,0.82)',
          border: `1px solid ${color}`,
          color: '#dfe5ec',
          padding: '2px 9px',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </Html>
  );
}

/** 건물 셸 — 도크 외벽 + 후면/측벽(카메라 반대편) + 지붕 트러스 + 천장 조명. */
function Building({ b }) {
  const H = b.height + 1;
  const wallTex = useTiled('/textures/wall_diff.jpg', '/textures/wall_rough.jpg', 10, 4);
  const trusses = [];
  const nTruss = Math.max(3, Math.round((b.z1 - b.z0) / 3));
  for (let i = 0; i <= nTruss; i++) {
    const z = b.z0 + ((b.z1 - b.z0) * i) / nTruss;
    trusses.push(
      <mesh key={`t${i}`} position={[(b.wallX + b.rackW) / 2, H, z]}>
        <boxGeometry args={[b.rackW - b.wallX + 2, 0.18, 0.18]} />
        <meshStandardMaterial color="#3a4250" metalness={0.4} roughness={0.6} />
      </mesh>,
    );
  }
  const lights = [];
  const nL = Math.max(2, Math.round((b.z1 - b.z0) / 5));
  for (let i = 0; i < nL; i++) {
    const z = b.z0 + 2 + ((b.z1 - b.z0 - 4) * i) / Math.max(1, nL - 1);
    for (const x of [b.wallX + 4, (b.wallX + b.rackW) / 2, b.rackW - 3]) {
      lights.push(
        <mesh key={`l${i}-${x}`} position={[x, H - 0.4, z]}>
          <boxGeometry args={[1.4, 0.12, 0.5]} />
          <meshStandardMaterial color="#fff6e6" emissive="#fff1d6" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>,
      );
    }
  }
  return (
    <group>
      {/* 도크 외벽 (-X) */}
      <mesh position={[b.wallX - 0.15, H / 2, (b.z0 + b.z1) / 2]} receiveShadow>
        <boxGeometry args={[0.3, H, b.z1 - b.z0]} />
        <meshStandardMaterial {...wallTex} color="#9097a1" metalness={0.35} roughness={0.78} />
      </mesh>
      {/* 후면 끝벽 (-Z, 카메라 반대편) */}
      <mesh position={[(b.wallX + b.rackW) / 2, H / 2, b.z0]} receiveShadow>
        <boxGeometry args={[b.rackW - b.wallX + 1, H, 0.3]} />
        <meshStandardMaterial {...wallTex} color="#9097a1" metalness={0.35} roughness={0.78} />
      </mesh>
      {trusses}
      {lights}
    </group>
  );
}

/**
 * 도크 도어 — 롤러 셔터(애니메이션) + 상단 드럼 + 신호등 + 레벨러 + 범퍼.
 * 트럭 입차(arriving/docked/departing) 시 셔터가 말려 올라가 개방, 출차 완료(gone) 시 폐쇄.
 */
function DockDoor({ dock, b }) {
  const shutter = useRef();
  const pRef = useRef(0);
  const open = dock.truck.state !== 'gone';
  const col = dock.kind === 'in' ? theme.ok : theme.caution;

  useFrame(() => {
    pRef.current = lerp(pRef.current, open ? 1 : 0, 0.1);
    const p = pRef.current;
    if (shutter.current) {
      shutter.current.scale.y = 1 - p * 0.84; // 닫힘 1 → 열림 0.16
      shutter.current.position.y = 1.6 + p * 1.55; // 위로 말려 올라감
    }
  });

  return (
    <group position={[b.wallX, 0, dock.z]}>
      {/* 문틀 + 컬러 라인 */}
      <mesh position={[0.12, 1.8, 0]}>
        <boxGeometry args={[0.16, 3.7, 3.5]} />
        <meshStandardMaterial color="#2b313a" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0.2, 1.8, 0]}>
        <boxGeometry args={[0.05, 3.6, 3.36]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.3} toneMapped={false} />
      </mesh>
      {/* 개구부(어두운 내부) */}
      <mesh position={[0.02, 1.65, 0]}>
        <boxGeometry args={[0.05, 3.1, 3.0]} />
        <meshStandardMaterial color="#090c10" />
      </mesh>
      {/* 롤러 셔터(애니메이션) */}
      <mesh ref={shutter} position={[0.16, 1.6, 0]} castShadow>
        <boxGeometry args={[0.08, 3.0, 2.92]} />
        <meshStandardMaterial color="#79818c" metalness={0.55} roughness={0.5} />
      </mesh>
      {/* 상단 셔터 드럼 */}
      <mesh position={[0.18, 3.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 3.1, 14]} />
        <meshStandardMaterial color="#3a4250" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* 신호등 — 개방(녹)/폐쇄(적) */}
      <mesh position={[0.22, 2.7, 1.85]}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial
          color={open ? theme.ok : theme.alarm}
          emissive={open ? theme.ok : theme.alarm}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>
      {/* 도크 레벨러(립) */}
      <mesh position={[-0.55, 0.55, 0]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[1.1, 0.08, 2.4]} />
        <meshStandardMaterial color="#2d333d" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* 범퍼 */}
      {[-1.35, 1.35].map((zz, i) => (
        <mesh key={i} position={[-0.12, 0.5, zz]} castShadow>
          <boxGeometry args={[0.28, 0.55, 0.36]} />
          <meshStandardMaterial color="#15181d" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** 실사 트럭(glTF) — 후면이 도크(group 원점, +X)를 향하도록 회전·배치. */
function Truck({ dock }) {
  const { scene } = useGLTF('/models/truck.glb');
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef();
  const t = dock.truck;
  const S = 1.5; // 원본 길이 4.87 → ~7.3m
  const LEN = 4.87 * S;
  useFrame(() => {
    if (ref.current) ref.current.position.x = lerp(ref.current.position.x, t.x, 0.18);
  });
  if (t.state === 'gone') return null;
  return (
    <group ref={ref} position={[t.x, 0, dock.z]}>
      {/* 길이축(Z)을 X로 회전, 캡이 -X(외부) 향하고 후면(뒷문)이 도크(+X 원점) 향하도록. */}
      <group position={[-LEN / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} scale={S}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

/** AGV — 진행 방향 회전 + 운반 팔레트. */
function Agv({ data, cs }) {
  const ref = useRef();
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.x = lerp(ref.current.position.x, data.x, 0.16);
    ref.current.position.z = lerp(ref.current.position.z, data.z, 0.16);
    let h = ref.current.rotation.y;
    let d = data.heading - h;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ref.current.rotation.y = h + d * 0.2;
  });
  return (
    <group ref={ref} position={[data.x, 0, data.z]} rotation={[0, data.heading, 0]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.95, 0.34, 1.35]} />
        <meshStandardMaterial color={data.carrying ? '#c2741f' : '#3f6080'} metalness={0.4} roughness={0.45} />
      </mesh>
      {/* 진행 방향 표시등(앞쪽 +Z) */}
      <mesh position={[0, 0.3, 0.7]}>
        <boxGeometry args={[0.5, 0.08, 0.06]} />
        <meshStandardMaterial color={theme.info} emissive={theme.info} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
      {data.carrying && (
        <mesh position={[0, 0.62, 0]} castShadow>
          <boxGeometry args={[cs.width * 0.72, cs.height * 0.5, cs.depth * 0.74]} />
          <meshStandardMaterial color={theme.load.B} roughness={0.85} />
        </mesh>
      )}
    </group>
  );
}

/** 도크 스테이징 — 대기 팔레트 스택. */
function Staging({ x, z, count, cs }) {
  const n = Math.min(count, 9);
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: n }).map((_, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        return (
          <mesh key={i} position={[row * 0.9, 0.4, col * 0.9 - 0.9]} castShadow>
            <boxGeometry args={[cs.width * 0.7, cs.height * 0.5, cs.depth * 0.7]} />
            <meshStandardMaterial color={theme.load.A} roughness={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function Facility() {
  const facility = useStore((s) => s.facility);
  const config = useStore((s) => s.config);
  if (!facility || !config) return null;
  const cs = config.cellSize;
  const b = facility.building;
  const midZ = (b.z0 + b.z1) / 2;

  // 입고/출하 도크 라벨 위치(각 종류 첫 도크 위)
  const inDock = facility.docks.find((d) => d.kind === 'in');
  const outDock = facility.docks.find((d) => d.kind === 'out');

  return (
    <group>
      <Building b={b} />

      {/* 전면 반송 레인 + 안전 라인 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.laneX, 0.015, midZ]} receiveShadow>
        <planeGeometry args={[1.8, b.z1 - b.z0]} />
        <meshStandardMaterial color="#1b212c" roughness={1} />
      </mesh>
      {[b.laneX - 0.95, b.laneX + 0.95].map((lx, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[lx, 0.02, midZ]}>
          <planeGeometry args={[0.08, b.z1 - b.z0]} />
          <meshStandardMaterial color={theme.safety} emissive={theme.safety} emissiveIntensity={0.15} toneMapped={false} />
        </mesh>
      ))}
      {/* 스테이징 영역 안전 라인 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(b.stagingX + b.wallX) / 2, 0.02, midZ]}>
        <planeGeometry args={[0.08, b.z1 - b.z0]} />
        <meshStandardMaterial color={theme.safety} emissive={theme.safety} emissiveIntensity={0.12} toneMapped={false} />
      </mesh>

      {/* P&D 스테이션 (통로 앞) */}
      {Array.from({ length: config.aisles }, (_, i) => {
        const z = i * config.aisleSpacing + cs.depth / 2;
        return (
          <mesh key={i} position={[-0.4, 0.05, z]} receiveShadow>
            <boxGeometry args={[1.0, 0.1, 1.1]} />
            <meshStandardMaterial color="#2a3344" emissive="#0a2030" emissiveIntensity={0.25} />
          </mesh>
        );
      })}

      {/* 도크 도어 · 트럭 · 스테이징 */}
      {facility.docks.map((d) => (
        <group key={d.id}>
          <DockDoor dock={d} b={b} />
          <Truck dock={d} />
          {d.kind === 'out' && <Staging x={b.stagingX + 1} z={d.z} count={d.staged} cs={cs} />}
        </group>
      ))}

      {/* AGV */}
      {facility.agvs.map((a) => (
        <Agv key={a.id} data={a} cs={cs} />
      ))}

      {/* 구역 라벨 */}
      {inDock && <ZoneLabel pos={[b.wallX - 1, 4.2, inDock.z]} text="입고 도크" color={theme.ok} />}
      {outDock && <ZoneLabel pos={[b.wallX - 1, 4.2, outDock.z]} text="출하 도크" color={theme.caution} />}
      <ZoneLabel pos={[b.rackW / 2, b.height + 0.5, midZ]} text="AS/RS 보관" color={theme.info} />
      <ZoneLabel pos={[b.laneX, 1.4, b.z0 + 2]} text="반송 AGV" color={theme.crane.RETURNING} />
    </group>
  );
}
