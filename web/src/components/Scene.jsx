import { Suspense, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
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

/** 카메라 프리셋 목표(월드 좌표). 콘텐츠는 Rig로 원점 중심 정렬됨. */
function computeGoal(focus, ext, config) {
  if (focus === 'dock') {
    return { pos: [-ext.x * 0.5 - 28, 6.5, 5], target: [-ext.x * 0.5 - 12.5, 3, 0] };
  }
  if (focus === 'staging') {
    // 내부에서 스테이징·상차(지게차·트럭 후면)를 들여다봄.
    return { pos: [-ext.x * 0.5 + 5, 5.5, ext.z * 0.5 + 6], target: [-ext.x * 0.5 - 9, 1.8, ext.z * 0.15] };
  }
  if (focus && focus.startsWith('aisle:') && config) {
    const n = parseInt(focus.split(':')[1], 10);
    const z = (n - 1) * config.aisleSpacing + config.cellSize.depth / 2 - ext.z / 2;
    // 통로 앞(−X)에서 +X 방향으로 통로를 따라 들여다봄 → 랙 사이 크레인/팔레트가 보임.
    return { pos: [-ext.x * 0.5 - 4.5, ext.y * 0.52, z], target: [ext.x * 0.5 - 3, ext.y * 0.42, z] };
  }
  // overview
  return { pos: [ext.x * 0.5 + 5, ext.y * 1.95 + 13, ext.z * 1.15 + 24], target: [-7, ext.y * 0.32, ext.z * 0.12] };
}

const _cv1 = new THREE.Vector3();
const _cv2 = new THREE.Vector3();

/**
 * 카메라 제어 — 정적 프리셋(전경/도크/상차장)은 부드럽게 1회 이동, `crane:N`은 해당 스태커
 * 크레인을 실시간 추적(크레인 장착 카메라처럼 통로 안을 따라가며 작업 표시).
 */
function CameraRig({ ext }) {
  const focus = useStore((s) => s.cameraFocus);
  const seq = useStore((s) => s.focusSeq);
  const config = useStore((s) => s.config);
  const controls = useThree((s) => s.controls);
  const camera = useThree((s) => s.camera);
  const anim = useRef(null);
  useEffect(() => {
    if (!controls || !camera) return;
    if (focus && focus.startsWith('crane:')) {
      anim.current = null; // 추적 모드 — useFrame이 매 프레임 따라감
      return;
    }
    const g = computeGoal(focus, ext, config);
    anim.current = {
      fromPos: camera.position.clone(),
      fromTgt: controls.target.clone(),
      toPos: new THREE.Vector3(...g.pos),
      toTgt: new THREE.Vector3(...g.target),
      t: 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
  useFrame((_, dt) => {
    if (!controls) return;
    const st = useStore.getState();
    const f = st.cameraFocus;
    // 크레인 추적 — 선택 크레인의 실시간 좌표를 따라 통로 안을 비행.
    if (f && f.startsWith('crane:') && st.config) {
      const n = parseInt(f.split(':')[1], 10);
      const cr = st.cranes.find((c) => c.aisle === n);
      if (cr) {
        const cs = st.config.cellSize;
        const wx = cr.x * cs.width - ext.x / 2;
        const wy = (cr.z - 1) * cs.height;
        const wz = (n - 1) * st.config.aisleSpacing + cs.depth / 2 - ext.z / 2;
        // 통로 안에서 크레인을 뒤따름 — 건물 밖으로 나가지 않게 전방(−X) 한계를 클램프.
        const camX = Math.max(-ext.x / 2 + 0.5, wx - 4.5);
        camera.position.lerp(_cv1.set(camX, wy * 0.4 + 3.6, wz), 0.06);
        controls.target.lerp(_cv2.set(wx + 1.5, wy * 0.55 + 0.9, wz), 0.12);
        controls.update();
      }
      return;
    }
    const a = anim.current;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / 1.1);
    const k = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2; // easeInOutQuad
    camera.position.lerpVectors(a.fromPos, a.toPos, k);
    controls.target.lerpVectors(a.fromTgt, a.toTgt, k);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
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
  // 낮은 3/4 앵글 — Z 오프셋을 줄여 통로 깊이가 보이고(크레인 식별), 입출하 도크(−X) 흐름까지 한 화면에.
  const cam = [ext.x * 0.5 + 5, ext.y * 1.95 + 13, ext.z * 1.15 + 24];
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
        target={[-7, ext.y * 0.32, ext.z * 0.12]}
        maxPolarAngle={Math.PI / 2.05}
        enableDamping
        dampingFactor={0.09}
        zoomSpeed={0.5}
        rotateSpeed={0.7}
        panSpeed={0.7}
        minDistance={4}
        maxDistance={Math.max(ext.x, ext.z) * 3 + 80}
      />
      <CameraRig ext={ext} />

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
