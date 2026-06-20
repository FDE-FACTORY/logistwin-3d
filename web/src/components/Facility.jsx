import { useRef, useMemo } from 'react';
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

// 도크 개구부 치수 — 외벽에 뚫는 구멍 + 도어 프레임 공유.
const DOCK_OPEN_HALF = 1.7; // 개구부 폭 절반(≈3.4m)
const DOCK_OPEN_TOP = 3.8; // 개구부 상단 높이

/** 건물 셸 — 도크 개구부가 뚫린 외벽 + 후면/측벽 + 지붕 트러스 + 천장 조명. */
function Building({ b, docks = [] }) {
  const H = b.height + 1;
  const wallTex = useTiled('/textures/wall_diff.jpg', '/textures/wall_rough.jpg', 10, 4);

  // −X 외벽을 도크 개구부 기준으로 분할 — 개구부 상단 인방(lintel) + 사이 벽체 세그먼트.
  // 외부에서 각 도크의 도어/셔터가 그대로 보이도록(통짜 벽 제거).
  const lowerSegs = useMemo(() => {
    const zs = docks.map((d) => d.z).sort((p, q) => p - q);
    const segs = [];
    let cursor = b.z0;
    for (const z of zs) {
      const gapStart = z - DOCK_OPEN_HALF;
      if (gapStart > cursor) segs.push([cursor, gapStart]);
      cursor = Math.max(cursor, z + DOCK_OPEN_HALF);
    }
    if (cursor < b.z1) segs.push([cursor, b.z1]);
    return segs;
  }, [docks, b.z0, b.z1]);
  const trusses = [];
  const nTruss = Math.max(3, Math.round((b.z1 - b.z0) / 3));
  for (let i = 0; i <= nTruss; i++) {
    const z = b.z0 + ((b.z1 - b.z0) * i) / nTruss;
    trusses.push(
      <mesh key={`t${i}`} position={[(b.wallX + b.rackW) / 2, H, z]}>
        <boxGeometry args={[b.rackW - b.wallX + 2, 0.16, 0.16]} />
        <meshStandardMaterial color="#5c6675" metalness={0.4} roughness={0.6} />
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
      {/* 도크 외벽 (-X) — 개구부 상단 인방 + 도크 사이 벽체 세그먼트 */}
      <mesh position={[b.wallX - 0.15, (DOCK_OPEN_TOP + H) / 2, (b.z0 + b.z1) / 2]} receiveShadow>
        <boxGeometry args={[0.3, H - DOCK_OPEN_TOP, b.z1 - b.z0]} />
        <meshStandardMaterial {...wallTex} color="#9097a1" metalness={0.35} roughness={0.78} />
      </mesh>
      {lowerSegs.map(([s0, s1], i) => (
        <mesh key={`seg${i}`} position={[b.wallX - 0.15, DOCK_OPEN_TOP / 2, (s0 + s1) / 2]} receiveShadow>
          <boxGeometry args={[0.3, DOCK_OPEN_TOP, s1 - s0]} />
          <meshStandardMaterial {...wallTex} color="#9097a1" metalness={0.35} roughness={0.78} />
        </mesh>
      ))}
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
      {/* 외부 도어 트림 — 개구부 양측 기둥 + 색상 헤더 + 번호 플레이트(외부에서 도크로 인식) */}
      {[-DOCK_OPEN_HALF + 0.12, DOCK_OPEN_HALF - 0.12].map((zz, i) => (
        <mesh key={`jamb${i}`} position={[-0.3, DOCK_OPEN_TOP / 2, zz]}>
          <boxGeometry args={[0.16, DOCK_OPEN_TOP, 0.22]} />
          <meshStandardMaterial color="#2b313a" metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[-0.3, DOCK_OPEN_TOP - 0.12, 0]}>
        <boxGeometry args={[0.18, 0.34, DOCK_OPEN_HALF * 2]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.35} toneMapped={false} />
      </mesh>
      <mesh position={[-0.34, DOCK_OPEN_TOP - 0.12, -DOCK_OPEN_HALF + 0.55]}>
        <boxGeometry args={[0.05, 0.26, 0.7]} />
        <meshStandardMaterial color="#0d1117" metalness={0.3} roughness={0.6} />
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

// 함대 차체 색상 변주 — 동일 트럭이 줄지어 선 인상을 피하려고 도크별로 도장색을 달리함.
const FLEET_TINTS = ['#e7eaee', '#c4ced9', '#9fb0c2', '#d6c6a8', '#a9bcb0', '#cdb6b0'];

/**
 * 절차적 박스 카고 트럭 — 적재함(후면 도어)이 도크(group +X)를 향해 후진 입차.
 * 소형 밴이 아닌 물류센터 규격의 윙바디/박스 트럭 형상(현실고증).
 */
function Truck({ dock }) {
  const ref = useRef();
  const t = dock.truck;
  const idx = parseInt(String(dock.id).replace(/\D/g, ''), 10) || 0;
  const body = FLEET_TINTS[idx % FLEET_TINTS.length];
  useFrame(() => {
    if (ref.current) ref.current.position.x = lerp(ref.current.position.x, t.x, 0.18);
  });
  if (t.state === 'gone') return null;

  // 로컬 +X = 후면(도크), −X = 캡(외부).
  const boxLen = 6.4;
  const boxW = 2.5;
  const boxH = 2.7;
  const bedH = 0.95; // 적재함 바닥 높이
  const cabLen = 2.2;
  const cabH = 2.0;
  const gap = 0.25;
  const cabFront = -(boxLen + gap + cabLen); // 캡 앞면 x
  const boxCY = bedH + boxH / 2;
  const wheelZ = boxW / 2 - 0.18;
  const axle = (x) =>
    [wheelZ, -wheelZ].map((z, i) => (
      <mesh key={`${x}-${i}`} position={[x, 0.5, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.32, 18]} />
        <meshStandardMaterial color="#0c0f14" roughness={0.9} />
      </mesh>
    ));

  return (
    <group ref={ref} position={[t.x, 0, dock.z]}>
      {/* 적재함(박스 바디) — 후면 x=0이 도크로 */}
      <mesh position={[-boxLen / 2, boxCY, 0]} castShadow receiveShadow>
        <boxGeometry args={[boxLen, boxH, boxW]} />
        <meshStandardMaterial color={body} metalness={0.12} roughness={0.6} />
      </mesh>
      {/* 후면 양판 도어 + 중앙 심 + 손잡이 */}
      <mesh position={[0.05, boxCY, 0]}>
        <boxGeometry args={[0.08, boxH - 0.14, boxW - 0.1]} />
        <meshStandardMaterial color="#aab2bb" metalness={0.2} roughness={0.58} />
      </mesh>
      <mesh position={[0.1, boxCY, 0]}>
        <boxGeometry args={[0.05, boxH - 0.14, 0.05]} />
        <meshStandardMaterial color="#5b6470" metalness={0.3} roughness={0.6} />
      </mesh>
      {[-0.34, 0.34].map((z, i) => (
        <mesh key={i} position={[0.12, boxCY - 0.1, z]}>
          <boxGeometry args={[0.06, 0.6, 0.06]} />
          <meshStandardMaterial color="#39414c" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* 섀시 빔 */}
      <mesh position={[(cabFront + 0.2) / 2, 0.62, 0]}>
        <boxGeometry args={[boxLen + gap + cabLen - 0.2, 0.22, boxW - 0.5]} />
        <meshStandardMaterial color="#23272e" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* 캡 */}
      <mesh position={[cabFront + cabLen / 2, bedH + cabH / 2, 0]} castShadow>
        <boxGeometry args={[cabLen, cabH, boxW - 0.05]} />
        <meshStandardMaterial color={body} metalness={0.2} roughness={0.5} />
      </mesh>
      {/* 윈드실드 */}
      <mesh position={[cabFront + 0.05, bedH + cabH * 0.64, 0]}>
        <boxGeometry args={[0.06, cabH * 0.46, boxW - 0.45]} />
        <meshStandardMaterial color="#0f141b" metalness={0.5} roughness={0.18} />
      </mesh>
      {/* 측면 캡 창 */}
      {[wheelZ + 0.02, -wheelZ - 0.02].map((z, i) => (
        <mesh key={i} position={[cabFront + cabLen * 0.42, bedH + cabH * 0.62, z]}>
          <boxGeometry args={[cabLen * 0.5, cabH * 0.38, 0.04]} />
          <meshStandardMaterial color="#0f141b" metalness={0.5} roughness={0.18} />
        </mesh>
      ))}
      {/* 헤드라이트 + 그릴 */}
      {[-0.8, 0.8].map((z, i) => (
        <mesh key={i} position={[cabFront + 0.02, bedH + 0.25, z]}>
          <boxGeometry args={[0.05, 0.26, 0.32]} />
          <meshStandardMaterial color="#eef3f8" emissive="#cdd8e2" emissiveIntensity={0.35} toneMapped={false} />
        </mesh>
      ))}
      {/* 바퀴: 전축 + 후축 2열(듀얼) */}
      {axle(cabFront + 1.0)}
      {axle(-1.1)}
      {axle(-2.25)}
    </group>
  );
}

/** 지게차 — 도크에서 스테이징↔트럭 상차 작업(프론트 애니메이션). */
function Forklift({ dock, b, cs }) {
  const ref = useRef();
  const forks = useRef();
  const pallet = useRef();
  const phase = useRef(0);
  const active = dock.kind === 'out' && dock.truck.state === 'docked';
  const x0 = b.stagingX + 2; // 스테이징 측
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (!active) {
      // 대기: 스테이징 옆에 정차, 포크 하강
      g.position.x = lerp(g.position.x, x0, 0.05);
      if (forks.current) forks.current.position.y = lerp(forks.current.position.y, 0.25, 0.1);
      if (pallet.current) pallet.current.visible = false;
      return;
    }
    phase.current = (phase.current + dt * 0.22) % 1;
    const p = phase.current;
    const x1 = dock.truck.x + 1.6; // 트럭 후면 직전(스테이징 측)
    let x = x0;
    let fy = 0.25;
    let carry = false;
    if (p < 0.4) {
      const u = p / 0.4;
      x = x0 + (x1 - x0) * u;
      fy = 0.4;
      carry = true;
    } else if (p < 0.52) {
      x = x1;
      fy = 0.4 + ((p - 0.4) / 0.12) * 1.1; // 트럭 안으로 들어올림
      carry = true;
    } else if (p < 0.9) {
      const u = (p - 0.52) / 0.38;
      x = x1 + (x0 - x1) * u;
      fy = 0.25;
      carry = false;
    }
    g.position.x = x;
    if (forks.current) forks.current.position.y = fy;
    if (pallet.current) pallet.current.visible = carry;
  });

  return (
    <group ref={ref} position={[x0, 0, dock.z + 0.6]} rotation={[0, Math.PI, 0]}>
      {/* 카운터웨이트 바디 (forks가 로컬+X → 회전으로 트럭(-X) 향함) */}
      <mesh position={[-0.5, 0.55, 0]} castShadow>
        <boxGeometry args={[1.3, 0.9, 1.0]} />
        <meshStandardMaterial color="#c8761e" metalness={0.3} roughness={0.55} />
      </mesh>
      {/* 운전석 + 오버헤드 가드 */}
      <mesh position={[-0.55, 1.0, 0]}>
        <boxGeometry args={[0.5, 0.3, 0.7]} />
        <meshStandardMaterial color="#1c2128" roughness={0.7} />
      </mesh>
      {[[-0.95, 0.45], [-0.1, 0.45], [-0.95, -0.45], [-0.1, -0.45]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.4, pz]}>
          <boxGeometry args={[0.06, 0.9, 0.06]} />
          <meshStandardMaterial color="#2a2f37" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[-0.5, 1.85, 0]}>
        <boxGeometry args={[0.95, 0.06, 1.0]} />
        <meshStandardMaterial color="#2a2f37" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* 마스트 (앞쪽 +X) */}
      {[-0.18, 0.18].map((pz, i) => (
        <mesh key={i} position={[0.45, 1.2, pz]} castShadow>
          <boxGeometry args={[0.1, 2.3, 0.1]} />
          <meshStandardMaterial color="#3a4250" metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
      {/* 포크(승강) */}
      <group ref={forks} position={[0, 0.25, 0]}>
        <mesh position={[0.55, 0, 0]}>
          <boxGeometry args={[0.12, 0.5, 0.9]} />
          <meshStandardMaterial color="#22272e" metalness={0.5} roughness={0.5} />
        </mesh>
        {[-0.28, 0.28].map((pz, i) => (
          <mesh key={i} position={[1.05, -0.18, pz]} castShadow>
            <boxGeometry args={[0.95, 0.06, 0.12]} />
            <meshStandardMaterial color="#15181d" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <mesh ref={pallet} position={[1.1, 0.12, 0]} visible={false} castShadow>
          <boxGeometry args={[cs.width * 0.7, cs.height * 0.5, cs.depth * 0.7]} />
          <meshStandardMaterial color={theme.load.A} roughness={0.85} />
        </mesh>
      </group>
      {/* 바퀴 */}
      {[[0.4, 0.55], [0.4, -0.55], [-0.85, 0.5], [-0.85, -0.5]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.28, pz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.22, 14]} />
          <meshStandardMaterial color="#0d1117" roughness={0.85} />
        </mesh>
      ))}
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
      <Building b={b} docks={facility.docks} />

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
          {d.kind === 'out' && d.truck.state === 'docked' && <Forklift dock={d} b={b} cs={cs} />}
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
