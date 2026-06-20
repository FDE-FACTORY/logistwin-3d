import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox, useGLTF } from '@react-three/drei';
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
 * 박스 카고 트럭 — 적재함(후면 양면 스윙 도어)이 도크(group +X)로 후진 입차.
 * 라운드 형상 + 캡/범퍼/미러/휠 디테일(레고 탈피). 도킹 시 후면 도어가 양옆으로 개방.
 */
function Truck({ dock }) {
  const ref = useRef();
  const doorL = useRef();
  const doorR = useRef();
  const dp = useRef(0);
  const t = dock.truck;
  const idx = parseInt(String(dock.id).replace(/\D/g, ''), 10) || 0;
  const body = FLEET_TINTS[idx % FLEET_TINTS.length];

  // 로컬 +X = 후면(도크), −X = 캡(외부).
  const boxLen = 6.2;
  const boxW = 2.5;
  const boxH = 2.7;
  const bedH = 1.0;
  const cabLen = 2.0;
  const cabH = 2.0;
  const gap = 0.12;
  const cabFront = -(boxLen + gap + cabLen);
  const boxCY = bedH + boxH / 2;
  const wz = boxW / 2 - 0.16;
  const doorH = boxH - 0.18;
  const doorW = boxW / 2 - 0.04;

  useFrame(() => {
    if (ref.current) ref.current.position.x = lerp(ref.current.position.x, t.x, 0.18);
    const open = t.state === 'docked' ? 1 : 0; // 도킹 시 후면 도어 개방
    dp.current = lerp(dp.current, open, 0.07);
    const a = dp.current * 1.75; // ~100° → 도어가 적재함 양 측면으로 접힘
    if (doorR.current) doorR.current.rotation.y = a;
    if (doorL.current) doorL.current.rotation.y = -a;
  });
  if (t.state === 'gone') return null;

  const wheel = (x, z, key) => (
    <group key={key} position={[x, 0.52, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.52, 0.52, 0.34, 22]} />
        <meshStandardMaterial color="#0c0f14" roughness={0.92} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, Math.sign(z) * 0.18]}>
        <cylinderGeometry args={[0.22, 0.22, 0.05, 16]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );

  return (
    <group ref={ref} position={[t.x, 0, dock.z]}>
      {/* 적재함(라운드 박스) */}
      <RoundedBox args={[boxLen, boxH, boxW]} radius={0.09} smoothness={3} position={[-boxLen / 2, boxCY, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={body} metalness={0.15} roughness={0.5} />
      </RoundedBox>
      {/* 후면 개구(어두운 화물칸) — 도어 개방 시 보임 */}
      <mesh position={[0.04, boxCY, 0]}>
        <boxGeometry args={[0.03, doorH, boxW - 0.18]} />
        <meshStandardMaterial color="#0a0d11" roughness={1} />
      </mesh>
      {/* 후면 양면 스윙 도어 — 도킹 시 양옆 개방 */}
      <group ref={doorR} position={[0.08, boxCY, wz + 0.04]}>
        <mesh position={[0, 0, -doorW / 2]} castShadow>
          <boxGeometry args={[0.06, doorH, doorW]} />
          <meshStandardMaterial color={body} metalness={0.15} roughness={0.5} />
        </mesh>
        <mesh position={[0.06, 0, -doorW + 0.12]}>
          <boxGeometry args={[0.05, 0.5, 0.05]} />
          <meshStandardMaterial color="#2b313a" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
      <group ref={doorL} position={[0.08, boxCY, -wz - 0.04]}>
        <mesh position={[0, 0, doorW / 2]} castShadow>
          <boxGeometry args={[0.06, doorH, doorW]} />
          <meshStandardMaterial color={body} metalness={0.15} roughness={0.5} />
        </mesh>
        <mesh position={[0.06, 0, doorW - 0.12]}>
          <boxGeometry args={[0.05, 0.5, 0.05]} />
          <meshStandardMaterial color="#2b313a" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
      {/* 섀시 빔 + 후미등 */}
      <mesh position={[(cabFront + 0.2) / 2, 0.66, 0]}>
        <boxGeometry args={[boxLen + gap + cabLen - 0.2, 0.2, boxW - 0.55]} />
        <meshStandardMaterial color="#20242b" metalness={0.4} roughness={0.6} />
      </mesh>
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[0.05, 0.78, s * (boxW / 2 - 0.2)]}>
          <boxGeometry args={[0.05, 0.22, 0.18]} />
          <meshStandardMaterial color="#b3402f" emissive="#902519" emissiveIntensity={0.5} toneMapped={false} />
        </mesh>
      ))}
      {/* 캡(라운드) */}
      <RoundedBox args={[cabLen, cabH, boxW - 0.06]} radius={0.13} smoothness={3} position={[cabFront + cabLen / 2, bedH + cabH / 2, 0]} castShadow>
        <meshStandardMaterial color={body} metalness={0.2} roughness={0.45} />
      </RoundedBox>
      {/* 윈드실드(경사) + 측면 캡 창 */}
      <mesh position={[cabFront + 0.16, bedH + cabH * 0.66, 0]} rotation={[0, 0, -0.32]}>
        <boxGeometry args={[0.05, cabH * 0.5, boxW - 0.5]} />
        <meshStandardMaterial color="#0e141c" metalness={0.6} roughness={0.12} />
      </mesh>
      {[wz + 0.04, -wz - 0.04].map((z, i) => (
        <mesh key={i} position={[cabFront + cabLen * 0.52, bedH + cabH * 0.58, z]}>
          <boxGeometry args={[cabLen * 0.46, cabH * 0.32, 0.03]} />
          <meshStandardMaterial color="#0e141c" metalness={0.6} roughness={0.12} />
        </mesh>
      ))}
      {/* 범퍼(크롬) + 그릴 + 헤드라이트 */}
      <mesh position={[cabFront - 0.1, bedH - 0.02, 0]} castShadow>
        <boxGeometry args={[0.3, 0.34, boxW - 0.12]} />
        <meshStandardMaterial color="#c7ccd2" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[cabFront + 0.02, bedH + 0.36, 0]}>
        <boxGeometry args={[0.04, 0.5, boxW - 0.6]} />
        <meshStandardMaterial color="#1a1e24" metalness={0.5} roughness={0.5} />
      </mesh>
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[cabFront - 0.02, bedH + 0.14, s * (boxW / 2 - 0.35)]}>
          <boxGeometry args={[0.05, 0.2, 0.3]} />
          <meshStandardMaterial color="#eef3f8" emissive="#dde7f0" emissiveIntensity={0.4} toneMapped={false} />
        </mesh>
      ))}
      {/* 사이드 미러 */}
      {[-1, 1].map((s, i) => (
        <group key={i} position={[cabFront + 0.35, bedH + cabH * 0.7, s * (boxW / 2 + 0.02)]}>
          <mesh position={[0, 0, s * 0.16]}>
            <boxGeometry args={[0.04, 0.04, 0.34]} />
            <meshStandardMaterial color="#2b313a" />
          </mesh>
          <mesh position={[0, 0, s * 0.34]}>
            <boxGeometry args={[0.06, 0.32, 0.12]} />
            <meshStandardMaterial color="#15181d" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      ))}
      {/* 휠 — 전축 + 후축 2열 + 머드가드 */}
      {wheel(cabFront + 1.0, wz, 'fa-r')}
      {wheel(cabFront + 1.0, -wz, 'fa-l')}
      {wheel(-1.0, wz, 'r1-r')}
      {wheel(-1.0, -wz, 'r1-l')}
      {wheel(-2.15, wz, 'r2-r')}
      {wheel(-2.15, -wz, 'r2-l')}
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[-1.55, 1.05, s * (wz + 0.02)]}>
          <boxGeometry args={[1.9, 0.1, 0.52]} />
          <meshStandardMaterial color="#1c2026" metalness={0.3} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

useGLTF.preload('/models/forklift.glb');
// 지게차 모델 보정 — 런타임 바운딩박스로 자동 스케일·접지(원본 변환 불문). 방향은 캡처로 튜닝.
const FORKLIFT_ROT = Math.PI / 2; // 포크가 트럭(−X)을 향하도록 회전(필요시 조정)
const FORKLIFT_LEN = 2.7; // 목표 전장(m)

/** 지게차 — glTF 실사 모델 + 스테이징↔트럭 상차 주행. */
function Forklift({ dock, b, cs }) {
  const { scene } = useGLTF('/models/forklift.glb');
  const model = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const s = FORKLIFT_LEN / Math.max(size.x, size.z, 0.001);
    c.scale.setScalar(s);
    c.position.set(-center.x * s, -box.min.y * s, -center.z * s); // 중심 정렬 + 바닥 접지
    c.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    return c;
  }, [scene]);
  const ref = useRef();
  const pallet = useRef();
  const phase = useRef(0);
  const active = dock.kind === 'out' && dock.truck.state === 'docked';
  const x0 = b.stagingX + 2; // 스테이징 측

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (!active) {
      g.position.x = lerp(g.position.x, x0, 0.05);
      if (pallet.current) pallet.current.visible = false;
      return;
    }
    phase.current = (phase.current + dt * 0.2) % 1;
    const p = phase.current;
    const x1 = dock.truck.x + 1.8; // 트럭 후면 직전
    let x = x0;
    let carry = false;
    if (p < 0.45) {
      x = x0 + (x1 - x0) * (p / 0.45);
      carry = true;
    } else if (p < 0.55) {
      x = x1;
      carry = true;
    } else if (p < 0.95) {
      x = x1 + (x0 - x1) * ((p - 0.55) / 0.4);
      carry = false;
    }
    g.position.x = x;
    if (pallet.current) pallet.current.visible = carry;
  });

  return (
    <group ref={ref} position={[x0, 0, dock.z + 0.6]}>
      <group rotation={[0, FORKLIFT_ROT, 0]}>
        <primitive object={model} />
      </group>
      {/* 운반 팔레트(포크 위, 트럭 방향 −X) */}
      <mesh ref={pallet} position={[-1.05, 0.55, 0]} visible={false} castShadow>
        <boxGeometry args={[cs.width * 0.7, cs.height * 0.5, cs.depth * 0.7]} />
        <meshStandardMaterial color={theme.load.A} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** 출고 컨베이어 — 통로 P&D에서 전면 메인 라인을 따라 도크 스테이징으로 이송하는 구조물. */
function Conveyor({ b, config, cs }) {
  const z0 = b.z0 + 1.2;
  const z1 = b.z1 - 1.2;
  const bedY = 0.42;
  const laneX = b.laneX;
  const pndX = b.pndX ?? -0.6;
  const mainLen = z1 - z0;
  const midZ = (z0 + z1) / 2;
  const aisleZs = Array.from({ length: config.aisles }, (_, i) => i * config.aisleSpacing + cs.depth / 2);
  const nLeg = Math.max(2, Math.round(mainLen / 3));
  const spurLen = Math.abs(pndX - laneX);
  return (
    <group>
      {/* 메인 라인 벨트 + 측면 프레임 */}
      <mesh position={[laneX, bedY, midZ]} receiveShadow castShadow>
        <boxGeometry args={[0.95, 0.14, mainLen]} />
        <meshStandardMaterial color="#23282f" metalness={0.4} roughness={0.55} />
      </mesh>
      {[-0.52, 0.52].map((dx, i) => (
        <mesh key={`mf${i}`} position={[laneX + dx, bedY, midZ]}>
          <boxGeometry args={[0.08, 0.2, mainLen]} />
          <meshStandardMaterial color="#3a4250" metalness={0.55} roughness={0.45} />
        </mesh>
      ))}
      {Array.from({ length: nLeg + 1 }).map((_, i) => (
        <mesh key={`leg${i}`} position={[laneX, bedY / 2 - 0.05, z0 + (mainLen * i) / nLeg]}>
          <boxGeometry args={[0.7, bedY, 0.07]} />
          <meshStandardMaterial color="#2a2f37" metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      {/* 통로 스퍼(통로 앞 → 메인 라인) */}
      {aisleZs.map((z, i) => (
        <group key={`spur${i}`}>
          <mesh position={[(pndX + laneX) / 2, bedY, z]} receiveShadow castShadow>
            <boxGeometry args={[spurLen, 0.14, 0.8]} />
            <meshStandardMaterial color="#23282f" metalness={0.4} roughness={0.55} />
          </mesh>
          {[-0.42, 0.42].map((dz, j) => (
            <mesh key={j} position={[(pndX + laneX) / 2, bedY, z + dz]}>
              <boxGeometry args={[spurLen, 0.2, 0.06]} />
              <meshStandardMaterial color="#3a4250" metalness={0.55} roughness={0.45} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** 컨베이어 위를 이동하는 팔레트(서버 좌표 보간). */
function ConveyorItem({ data, cs }) {
  const ref = useRef();
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.x = lerp(ref.current.position.x, data.x, 0.22);
    ref.current.position.z = lerp(ref.current.position.z, data.z, 0.22);
  });
  return (
    <group ref={ref} position={[data.x, 0.55, data.z]}>
      <mesh castShadow>
        <boxGeometry args={[cs.width * 0.78, 0.12, cs.depth * 0.78]} />
        <meshStandardMaterial color="#6b5236" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[cs.width * 0.66, 0.48, cs.depth * 0.66]} />
        <meshStandardMaterial color={theme.load[data.grade] || theme.load.B} roughness={0.85} />
      </mesh>
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

      {/* 출고 컨베이어 + 컨베이어 위 팔레트 */}
      <Conveyor b={b} config={config} cs={cs} />
      {(facility.conveyor || []).map((it) => (
        <ConveyorItem key={it.id} data={it} cs={cs} />
      ))}

      {/* 구역 라벨 */}
      {inDock && <ZoneLabel pos={[b.wallX - 1, 4.2, inDock.z]} text="입고 도크" color={theme.ok} />}
      {outDock && <ZoneLabel pos={[b.wallX - 1, 4.2, outDock.z]} text="출하 도크" color={theme.caution} />}
      <ZoneLabel pos={[b.rackW / 2, b.height + 0.5, midZ]} text="AS/RS 보관" color={theme.info} />
      <ZoneLabel pos={[b.laneX, 1.4, b.z0 + 2]} text="출고 컨베이어" color={theme.crane.RETURNING} />
    </group>
  );
}
