import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { useStore } from '../store.js';
import { warehouseExtent } from '../coords.js';
import { theme } from '../theme.js';
import Warehouse from './Warehouse.jsx';
import Crane from './Crane.jsx';

/** 창고를 원점 중심으로 정렬하는 그룹. */
function Rig({ ext, children }) {
  return <group position={[-ext.x / 2, 0, -ext.z / 2]}>{children}</group>;
}

function Floor({ ext }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ext.x / 2, -0.04, ext.z / 2]} receiveShadow>
      <planeGeometry args={[ext.x + 40, ext.z + 40]} />
      <meshStandardMaterial color="#10151c" metalness={0.1} roughness={0.95} />
    </mesh>
  );
}

export default function Scene() {
  const config = useStore((s) => s.config);
  const cranes = useStore((s) => s.cranes);
  const ext = config ? warehouseExtent(config) : { x: 30, y: 8, z: 20 };
  // 낮은 3/4 앵글 — 크레인 주행/마스트가 돋보이도록.
  const cam = [ext.x * 0.42, ext.y * 1.5 + 6, ext.z * 1.35 + 16];
  const shadowS = Math.max(ext.x, ext.z) / 2 + 8;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: cam, fov: 48, far: 6000 }}
      gl={{ antialias: true, toneMappingExposure: 1.15 }}
    >
      <color attach="background" args={[theme.bgDeep]} />
      <fog attach="fog" args={[theme.bgDeep, ext.z * 2 + 40, ext.z * 5 + 160]} />

      {/* 조명: 키(그림자) + 반구 채움 + 림 */}
      <ambientLight intensity={0.32} />
      <hemisphereLight args={['#bcd0f0', '#0a0e1a', 0.55]} />
      <directionalLight
        position={[ext.x * 0.8, ext.y * 3 + 28, ext.z * 0.7]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={ext.y * 6 + 120}
        shadow-camera-left={-shadowS}
        shadow-camera-right={shadowS}
        shadow-camera-top={shadowS}
        shadow-camera-bottom={-shadowS}
      />
      <directionalLight position={[-ext.x * 0.6, ext.y * 1.8, -ext.z * 0.8]} intensity={0.45} color="#5b8def" />

      {config && (
        <Rig ext={ext}>
          <Floor ext={ext} />
          <ContactShadows
            position={[ext.x / 2, 0, ext.z / 2]}
            scale={Math.max(ext.x, ext.z) * 1.4}
            resolution={1024}
            blur={2.4}
            opacity={0.55}
            far={ext.y + 4}
          />
          <Warehouse />
          {cranes.map((c) => (
            <Crane key={c.id} data={c} />
          ))}
        </Rig>
      )}

      <OrbitControls makeDefault target={[0, ext.y * 0.35, 0]} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
