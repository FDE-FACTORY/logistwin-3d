import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, useTexture, Environment } from '@react-three/drei';
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
      {/* 창고 내부 HDRI — 이미지 기반 조명(IBL) + 배경 */}
      <Suspense fallback={null}>
        <Environment files="/hdri/empty_warehouse_01.hdr" background backgroundBlurriness={0.55} environmentIntensity={1.05} />
      </Suspense>

      {/* 그림자용 키 라이트(HDRI는 부드러운 채움, 직사광 그림자는 별도) */}
      <ambientLight intensity={0.12} />
      <directionalLight
        position={[ext.x * 0.8, ext.y * 3 + 28, ext.z * 0.7]}
        intensity={1.15}
        color="#fff3e2"
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
