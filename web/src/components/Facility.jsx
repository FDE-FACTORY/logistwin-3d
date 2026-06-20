import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useStore } from '../store.js';
import { theme } from '../theme.js';
import { useTiled } from '../useTiled.js';

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

/** 도크 도어(롤러 셔터) + 범퍼 + 도크 레벨러. 트럭 정차 시 셔터 개방. */
function DockDoor({ dock, b }) {
  const open = dock.truck.state === 'docked' || dock.truck.state === 'arriving';
  const col = dock.kind === 'in' ? theme.ok : theme.caution;
  return (
    <group position={[b.wallX, 0, dock.z]}>
      {/* 셔터 (개방 시 위로) */}
      <mesh position={[0.05, open ? 3.4 : 1.6, 0]}>
        <boxGeometry args={[0.12, open ? 0.6 : 3.0, 2.9]} />
        <meshStandardMaterial color="#5b6470" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* 문틀 컬러 라인 */}
      <mesh position={[0.13, 1.8, 0]}>
        <boxGeometry args={[0.06, 3.4, 3.2]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.25} toneMapped={false} />
      </mesh>
      {/* 도크 레벨러(립) */}
      <mesh position={[-0.5, 0.55, 0]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[1.0, 0.08, 2.4]} />
        <meshStandardMaterial color="#2d333d" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* 범퍼 */}
      {[-1.3, 1.3].map((zz, i) => (
        <mesh key={i} position={[-0.1, 0.5, zz]}>
          <boxGeometry args={[0.25, 0.5, 0.35]} />
          <meshStandardMaterial color="#15181d" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** 실사 트럭 — 트레일러 + 캡 + 바퀴. 후면(rearX)이 도크를 향함. */
function Truck({ dock }) {
  const ref = useRef();
  const t = dock.truck;
  const TRAILER = 6.6;
  const CAB = 2.4;
  useFrame(() => {
    if (ref.current) ref.current.position.x = lerp(ref.current.position.x, t.x, 0.18);
  });
  if (t.state === 'gone') return null;
  const docked = t.state === 'docked';
  return (
    <group ref={ref} position={[t.x, 0, dock.z]}>
      {/* 트레일러 박스 (후면이 group 원점=도크쪽) */}
      <mesh position={[-TRAILER / 2 - 0.1, 1.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[TRAILER, 2.7, 2.55]} />
        <meshStandardMaterial color="#d7dade" metalness={0.1} roughness={0.55} />
      </mesh>
      {/* 후면 도어(개방 시 안쪽 어둡게) */}
      <mesh position={[-0.12, 1.85, 0]}>
        <boxGeometry args={[0.06, 2.5, 2.4]} />
        <meshStandardMaterial color={docked ? '#0c0f13' : '#b9bcc1'} roughness={0.8} />
      </mesh>
      {/* 적재물(만재도) */}
      {Array.from({ length: Math.min(t.loaded, 6) }).map((_, i) => (
        <mesh key={i} position={[-0.7 - (i % 3) * 0.9, 1.0 + Math.floor(i / 3) * 0.85, 0]} castShadow>
          <boxGeometry args={[0.7, 0.7, 1.9]} />
          <meshStandardMaterial color={theme.load.B} roughness={0.85} />
        </mesh>
      ))}
      {/* 샤시 */}
      <mesh position={[-TRAILER / 2 - 0.1, 0.7, 0]}>
        <boxGeometry args={[TRAILER + 0.5, 0.25, 1.0]} />
        <meshStandardMaterial color="#23282f" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* 캡 */}
      <mesh position={[-TRAILER - CAB / 2, 1.25, 0]} castShadow>
        <boxGeometry args={[CAB, 2.0, 2.45]} />
        <meshStandardMaterial color={dock.kind === 'in' ? '#4f5b6b' : '#566173'} metalness={0.3} roughness={0.45} />
      </mesh>
      <mesh position={[-TRAILER - CAB + 0.2, 1.6, 0]}>
        <boxGeometry args={[0.5, 0.8, 2.2]} />
        <meshStandardMaterial color="#0b1d2e" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* 바퀴 */}
      {[-0.9, -2.2, -TRAILER - 0.5, -TRAILER - CAB + 0.5].map((wx, i) =>
        [-1.15, 1.15].map((wz, j) => (
          <mesh key={`${i}-${j}`} position={[wx, 0.5, wz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.5, 0.5, 0.32, 16]} />
            <meshStandardMaterial color="#0d1117" roughness={0.85} />
          </mesh>
        )),
      )}
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
