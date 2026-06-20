import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store.js';
import { theme } from '../theme.js';

/** 박스 트럭 (캡 + 화물칸 + 바퀴). departProgress로 출발 애니메이션. */
function Truck({ x, z, color = '#3a4658', departProgress = 0 }) {
  const offset = departProgress * 16; // 출발 시 -x로 멀어짐
  return (
    <group position={[x - offset, 0, z]}>
      <mesh position={[0, 0.85, 0.4]} castShadow>
        <boxGeometry args={[2.2, 1.5, 2.6]} />
        <meshStandardMaterial color={color} metalness={0.2} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.7, -1.4]} castShadow>
        <boxGeometry args={[2.0, 1.2, 1.1]} />
        <meshStandardMaterial color="#222b36" metalness={0.3} roughness={0.5} />
      </mesh>
      {[[-1.0, -1.3], [1.0, -1.3], [-1.0, 1.0], [1.0, 1.0]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.3, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.32, 0.32, 0.24, 14]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      ))}
    </group>
  );
}

/** 도크 플랫폼 + 색 라인. */
function Dock({ x, z, color }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[3.0, 0.3, 4.0]} />
        <meshStandardMaterial color="#1b2230" metalness={0.1} roughness={0.8} />
      </mesh>
      <mesh position={[1.5, 0.32, 0]}>
        <boxGeometry args={[0.12, 0.06, 4.0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 도크 스테이징 — 대기 팔레트 스택(개수). */
function Staged({ x, z, count, cs }) {
  const n = Math.min(count, 12);
  const items = [];
  for (let i = 0; i < n; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    items.push(
      <mesh key={i} position={[col * 0.7 - 0.7, 0.45, z - 1.2 + row * 0.7]} castShadow>
        <boxGeometry args={[cs.width * 0.6, cs.height * 0.4, cs.depth * 0.6]} />
        <meshStandardMaterial color="#c77512" roughness={0.8} />
      </mesh>,
    );
  }
  return <group position={[x, 0, 0]}>{items}</group>;
}

export default function Facility() {
  const facility = useStore((s) => s.facility);
  const config = useStore((s) => s.config);
  const refs = useRef({});

  useFrame((_, dt) => {
    if (!facility) return;
    const k = 1 - Math.pow(0.002, Math.min(dt, 0.05));
    for (const a of facility.agvs) {
      const g = refs.current[a.id];
      if (g) {
        g.position.x += (a.x - g.position.x) * k;
        g.position.z += (a.z - g.position.z) * k;
      }
    }
  });

  if (!facility || !config) return null;
  const cs = config.cellSize;

  return (
    <group>
      {/* 전면 반송 레인 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[facility.lane.x, 0.015, (facility.lane.z0 + facility.lane.z1) / 2]}
        receiveShadow
      >
        <planeGeometry args={[1.7, facility.lane.z1 - facility.lane.z0]} />
        <meshStandardMaterial color="#161d2a" />
      </mesh>

      {/* P&D 스테이션 (통로 앞) */}
      {Array.from({ length: config.aisles }, (_, i) => {
        const z = i * config.aisleSpacing + cs.depth / 2;
        return (
          <mesh key={i} position={[0, 0.05, z]} receiveShadow>
            <boxGeometry args={[1.1, 0.1, 1.1]} />
            <meshStandardMaterial color="#26334a" emissive="#0a2030" emissiveIntensity={0.3} />
          </mesh>
        );
      })}

      {/* 출하 도크 + 트럭 + 스테이징 */}
      <Dock x={facility.outDock.x} z={facility.outDock.z} color={theme.caution} />
      <Truck x={facility.outDock.x - 1.7} z={facility.outDock.z} departProgress={facility.truck.departProgress} />
      <Staged x={facility.outDock.x + 1.0} z={facility.outDock.z} count={facility.staged} cs={cs} />

      {/* 입고 도크 + 트럭 */}
      <Dock x={facility.inDock.x} z={facility.inDock.z} color={theme.ok} />
      <Truck x={facility.inDock.x - 1.7} z={facility.inDock.z} />

      {/* AGV(로봇 대차) */}
      {facility.agvs.map((a) => (
        <group
          key={a.id}
          ref={(el) => {
            if (el) refs.current[a.id] = el;
          }}
          position={[a.x, 0, a.z]}
        >
          <mesh position={[0, 0.26, 0]} castShadow>
            <boxGeometry args={[0.95, 0.45, 1.25]} />
            <meshStandardMaterial color={a.carrying ? theme.caution : '#3f6080'} metalness={0.3} roughness={0.5} />
          </mesh>
          {a.carrying && (
            <mesh position={[0, 0.72, 0]} castShadow>
              <boxGeometry args={[cs.width * 0.7, cs.height * 0.5, cs.depth * 0.7]} />
              <meshStandardMaterial color="#c77512" roughness={0.8} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
