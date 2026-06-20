import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, useTexture } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, SMAA, ToneMapping } from '@react-three/postprocessing';
import { useStore } from '../store.js';
import { warehouseExtent } from '../coords.js';
import { theme } from '../theme.js';
import Warehouse from './Warehouse.jsx';
import Crane from './Crane.jsx';
import Facility from './Facility.jsx';

/** 창고를 원점 중심으로 정렬하는 그룹. */
function Rig({ ext, children }) {
  return <group position={[-ext.x / 2, 0, -ext.z / 2]}>{children}</group>;
}

function Floor({ ext }) {
  const [map, roughMap] = useTexture(['/textures/concrete_diff.jpg', '/textures/concrete_rough.jpg']);
  useMemo(() => {
    [map, roughMap].forEach((t) => {
      if (!t) return;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set((ext.x + 60) / 3, (ext.z + 60) / 3);
      t.anisotropy = 4;
    });
  }, [map, roughMap, ext]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ext.x / 2, -0.04, ext.z / 2]} receiveShadow>
      <planeGeometry args={[ext.x + 60, ext.z + 60]} />
      <meshStandardMaterial map={map} roughnessMap={roughMap} color="#8c8c88" metalness={0} roughness={1} />
    </mesh>
  );
}

export default function Scene() {
  const config = useStore((s) => s.config);
  const cranes = useStore((s) => s.cranes);
  const ext = config ? warehouseExtent(config) : { x: 30, y: 8, z: 20 };
  // 낮은 3/4 앵글 — 입출하 도크(−X)까지 한 화면에.
  const cam = [ext.x * 0.42, ext.y * 1.8 + 12, ext.z * 1.7 + 30];
  const shadowS = Math.max(ext.x, ext.z) / 2 + 16;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: cam, fov: 48, far: 6000 }}
      gl={{ antialias: true, toneMappingExposure: 1.15 }}
    >
      <color attach="background" args={['#12161b']} />
      <fog attach="fog" args={['#12161b', ext.z * 2 + 60, ext.z * 5 + 200]} />

      {/* 산업 조명: 따뜻한 키(그림자) + 반구 채움 + 중성 림 */}
      <ambientLight intensity={0.46} />
      <hemisphereLight args={['#d2ccbb', '#16181d', 0.5]} />
      <directionalLight
        position={[ext.x * 0.8, ext.y * 3 + 28, ext.z * 0.7]}
        intensity={1.5}
        color="#fff2df"
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
      <directionalLight position={[-ext.x * 0.6, ext.y * 1.8, -ext.z * 0.8]} intensity={0.3} color="#9fb0c8" />

      {config && (
        <Suspense fallback={null}>
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
          <Facility />
          {cranes.map((c) => (
            <Crane key={c.id} data={c} />
          ))}
        </Rig>
        </Suspense>
      )}

      <OrbitControls
        makeDefault
        target={[-6, ext.y * 0.3, 0]}
        maxPolarAngle={Math.PI / 2.05}
        enableDamping
        dampingFactor={0.09}
        zoomSpeed={0.5}
        rotateSpeed={0.7}
        panSpeed={0.7}
        minDistance={4}
        maxDistance={Math.max(ext.x, ext.z) * 3 + 80}
      />

      {/* 포스트프로세싱 — 앰비언트 오클루전(접지·입체감) + 블룸 + AA */}
      <EffectComposer disableNormalPass multisampling={0}>
        <N8AO halfRes aoRadius={1.5} intensity={2.6} distanceFalloff={1.2} />
        <Bloom intensity={0.2} luminanceThreshold={0.85} mipmapBlur />
        <ToneMapping />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}
