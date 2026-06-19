import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from '../store.js';
import { warehouseExtent } from '../coords.js';
import Warehouse from './Warehouse.jsx';
import Crane from './Crane.jsx';

/** 창고를 원점 중심으로 정렬하는 그룹. */
function Rig({ ext, children }) {
  return <group position={[-ext.x / 2, 0, -ext.z / 2]}>{children}</group>;
}

function Floor({ ext }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ext.x / 2, -0.03, ext.z / 2]} receiveShadow>
      <planeGeometry args={[ext.x + 24, ext.z + 24]} />
      <meshStandardMaterial color="#0f172a" />
    </mesh>
  );
}

export default function Scene() {
  const config = useStore((s) => s.config);
  const cranes = useStore((s) => s.cranes);
  const ext = config ? warehouseExtent(config) : { x: 30, y: 8, z: 20 };
  const cam = [ext.x * 0.55, ext.y * 2.4 + 10, ext.z * 1.15 + 14];

  return (
    <Canvas shadows camera={{ position: cam, fov: 50, far: 4000 }} dpr={[1, 2]}>
      <color attach="background" args={['#0b1020']} />
      <fog attach="fog" args={['#0b1020', ext.z * 1.6 + 30, ext.z * 4 + 120]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#cbd5e1', '#0b1020', 0.5]} />
      <directionalLight position={[ext.x, ext.y * 3 + 20, ext.z * 1.5]} intensity={1.15} castShadow />
      {config && (
        <Rig ext={ext}>
          <Floor ext={ext} />
          <Warehouse />
          {cranes.map((c) => (
            <Crane key={c.id} data={c} />
          ))}
        </Rig>
      )}
      <OrbitControls makeDefault target={[0, ext.y * 0.3, 0]} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
