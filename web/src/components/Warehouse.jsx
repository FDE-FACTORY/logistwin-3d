import { useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useStore } from '../store.js';
import { cellWorldFromId, parseCellId } from '../coords.js';
import { theme } from '../theme.js';
import { useTiled } from '../useTiled.js';

/**
 * 셀렉티브 파렛트 랙 구조 — 철골 업라이트 프레임 + 오렌지 로드빔(실사 형상).
 * 장난감 와이어프레임 대신 실제 창고 랙처럼 프레임/빔으로 구성.
 */
function RackStructure({ config }) {
  const cs = config.cellSize;
  const postH = config.levels * cs.height + 0.2;
  const blockW = config.baysPerSide * cs.width;
  const frameStep = Math.max(2, Math.round(config.baysPerSide / 8)); // 프레임 간격(베이)
  const zf = cs.depth * 0.42; // 프레임 전/후 오프셋

  const uprights = useMemo(() => {
    const arr = [];
    for (let a = 1; a <= config.aisles; a++) {
      for (const side of ['L', 'R']) {
        const z = (a - 1) * config.aisleSpacing + (side === 'R' ? cs.depth : 0);
        for (let b = 0; b <= config.baysPerSide; b += frameStep) {
          const x = b * cs.width - cs.width / 2;
          arr.push([x, postH / 2, z - zf]);
          arr.push([x, postH / 2, z + zf]);
        }
      }
    }
    return arr;
  }, [config, cs.width, cs.depth, postH, frameStep, zf]);

  const beams = useMemo(() => {
    const arr = [];
    for (let a = 1; a <= config.aisles; a++) {
      for (const side of ['L', 'R']) {
        const z = (a - 1) * config.aisleSpacing + (side === 'R' ? cs.depth : 0);
        for (let lvl = 1; lvl <= config.levels; lvl++) {
          const y = lvl * cs.height;
          arr.push([blockW / 2 - cs.width / 2, y, z - zf]);
          arr.push([blockW / 2 - cs.width / 2, y, z + zf]);
        }
      }
    }
    return arr;
  }, [config, cs.width, cs.height, cs.depth, blockW, zf]);

  const metalTex = useTiled('/textures/metal_diff.jpg', '/textures/metal_rough.jpg', 1, 4);
  const upRef = useRef();
  const beamRef = useRef();
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    if (upRef.current) {
      uprights.forEach((p, i) => {
        d.position.set(p[0], p[1], p[2]);
        d.scale.set(0.1, postH, 0.1);
        d.updateMatrix();
        upRef.current.setMatrixAt(i, d.matrix);
      });
      upRef.current.instanceMatrix.needsUpdate = true;
    }
    if (beamRef.current) {
      beams.forEach((p, i) => {
        d.position.set(p[0], p[1], p[2]);
        d.scale.set(blockW, 0.07, 0.06);
        d.updateMatrix();
        beamRef.current.setMatrixAt(i, d.matrix);
      });
      beamRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [uprights, beams, postH, blockW]);

  return (
    <group>
      <instancedMesh ref={upRef} args={[undefined, undefined, uprights.length]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial {...metalTex} color="#5a6478" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={beamRef} args={[undefined, undefined, beams.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#b4651a" metalness={0.45} roughness={0.55} />
      </instancedMesh>
    </group>
  );
}

/** 통로별 상·하 가이드 레일 (크레인 주행로). */
function GuideRails({ config }) {
  const cs = config.cellSize;
  const len = config.baysPerSide * cs.width;
  const topY = config.levels * cs.height + 0.5;
  const rails = [];
  for (let a = 1; a <= config.aisles; a++) {
    const z = (a - 1) * config.aisleSpacing + cs.depth / 2;
    rails.push(
      <mesh key={`f${a}`} position={[len / 2 - cs.width / 2, 0.06, z]} receiveShadow>
        <boxGeometry args={[len, 0.12, 0.14]} />
        <meshStandardMaterial color="#3a4658" metalness={0.6} roughness={0.4} />
      </mesh>,
      <mesh key={`t${a}`} position={[len / 2 - cs.width / 2, topY, z]}>
        <boxGeometry args={[len, 0.1, 0.1]} />
        <meshStandardMaterial color="#3a4658" metalness={0.6} roughness={0.4} />
      </mesh>,
    );
  }
  return <group>{rails}</group>;
}

/** 문자열 해시 → 0~999 (적재물 높이/색조 미세 변주용, 결정론적). */
function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 1000;
}

/**
 * 점유 셀 화물 — 나무 파렛트 + 골판지/랩 적재물(실사 톤). 두 InstancedMesh.
 * 등급은 톤으로만 미세 구분(장난감 큐브 느낌 제거), 높이 변주로 자연스럽게.
 */
function Pallets({ config }) {
  const baseRef = useRef();
  const loadRef = useRef();
  const cells = useStore((s) => s.cells);
  const version = useStore((s) => s.cellsVersion);
  const floor = useStore((s) => s.floorFilter);
  const cs = config.cellSize;
  const max = config.aisles * 2 * config.baysPerSide * config.levels;
  const woodTex = useTiled('/textures/wood_diff.jpg', '/textures/wood_rough.jpg', 1, 1);

  useEffect(() => {
    const base = baseRef.current;
    const load = loadRef.current;
    if (!base || !load) return;
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    let i = 0;
    cells.forEach((v, id) => {
      if (!v.occupied) return;
      if (floor) {
        const pc = parseCellId(id);
        if (pc && pc.level !== floor) return; // 선택 층만 표시
      }
      const p = cellWorldFromId(config, id);
      if (!p) return;
      const hh = hashId(id);
      const loadH = cs.height * (0.5 + (hh % 28) / 100); // 0.50~0.78 높이 변주

      // 나무 파렛트 (셀 바닥의 얇은 슬랩)
      d.position.set(p.x, p.y + cs.height * 0.07, p.z);
      d.scale.set(cs.width * 0.92, cs.height * 0.12, cs.depth * 0.92);
      d.updateMatrix();
      base.setMatrixAt(i, d.matrix);

      // 적재물 (골판지/랩) — 등급 톤 + 미세 명도 변주
      d.position.set(p.x, p.y + cs.height * 0.13 + loadH / 2, p.z);
      d.scale.set(cs.width * 0.8, loadH, cs.depth * 0.8);
      d.updateMatrix();
      load.setMatrixAt(i, d.matrix);
      col.set(theme.load[v.grade] || '#9a8a72');
      col.offsetHSL(0, 0, ((hh % 12) - 6) / 240); // ±명도 미세 변주
      load.setColorAt(i, col);
      i += 1;
    });
    base.count = i;
    load.count = i;
    base.instanceMatrix.needsUpdate = true;
    load.instanceMatrix.needsUpdate = true;
    if (load.instanceColor) load.instanceColor.needsUpdate = true;
  }, [version, config, cells, cs.depth, cs.height, cs.width, floor]);

  return (
    <group>
      <instancedMesh ref={baseRef} args={[undefined, undefined, max]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial {...woodTex} color="#a07b45" roughness={0.9} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={loadRef} args={[undefined, undefined, max]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.88} metalness={0} />
      </instancedMesh>
    </group>
  );
}

/**
 * 자동화구역 안전 펜스 — 랙 전면(−X)에 가드레일. 자동 크레인 위험구역과 작업자/AGV
 * 영역을 분리하는 현장 표준 요소. 통로 입구(P&D)마다 AGV 통행용 개구를 둔다.
 */
function SafetyFence({ config }) {
  const cs = config.cellSize;
  const zExt = (config.aisles - 1) * config.aisleSpacing + cs.depth;
  const fx = -cs.width * 1.3; // 랙 전면과 반송 레인 사이
  const H = 2.3;
  const openHalf = 0.95; // 통로 입구 개구 절반
  const z0 = -0.6;
  const z1 = zExt + 0.6;
  const segs = useMemo(() => {
    const gaps = Array.from({ length: config.aisles }, (_, i) => i * config.aisleSpacing + cs.depth / 2).sort((a, b) => a - b);
    const out = [];
    let cur = z0;
    for (const gz of gaps) {
      const gs = gz - openHalf;
      if (gs > cur) out.push([cur, gs]);
      cur = Math.max(cur, gz + openHalf);
    }
    if (cur < z1) out.push([cur, z1]);
    return out;
  }, [config.aisles, config.aisleSpacing, cs.depth, z0, z1]);

  return (
    <group>
      {segs.map(([s0, s1], i) => {
        const len = s1 - s0;
        const mid = (s0 + s1) / 2;
        const nPost = Math.max(2, Math.round(len / 1.8) + 1);
        return (
          <group key={i} position={[fx, 0, mid]}>
            {[0.2, 1.15, H - 0.05].map((yy, j) => (
              <mesh key={j} position={[0, yy, 0]}>
                <boxGeometry args={[0.05, 0.05, len]} />
                <meshStandardMaterial color={theme.safety} metalness={0.3} roughness={0.6} />
              </mesh>
            ))}
            {Array.from({ length: nPost }).map((_, k) => {
              const t = nPost > 1 ? k / (nPost - 1) : 0;
              return (
                <mesh key={k} position={[0, H / 2, -len / 2 + t * len]} castShadow>
                  <boxGeometry args={[0.08, H, 0.08]} />
                  <meshStandardMaterial color="#c2ad36" metalness={0.35} roughness={0.6} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

/** 입출하장(I/O) 플랫폼 표시. */
function IOStation({ config }) {
  const cs = config.cellSize;
  const depth = (config.aisles - 1) * config.aisleSpacing + cs.depth;
  return (
    <mesh position={[-cs.width, 0.06, depth / 2]} receiveShadow>
      <boxGeometry args={[1.6, 0.12, depth + 2]} />
      <meshStandardMaterial color="#10b981" emissive="#065f46" emissiveIntensity={0.45} />
    </mesh>
  );
}

/** 예외 셀 강조 — 적색 와이어 케이지. */
function ExceptionMarkers({ config }) {
  const exceptions = useStore((s) => s.exceptions);
  const cs = config.cellSize;
  if (!exceptions.length) return null;
  return (
    <group>
      {exceptions.map((e) => {
        const p = cellWorldFromId(config, e.cellId);
        if (!p) return null;
        return (
          <mesh key={e.id} position={[p.x, p.y + cs.height * 0.5, p.z]}>
            <boxGeometry args={[cs.width * 0.98, cs.height * 0.92, cs.depth * 0.98]} />
            <meshBasicMaterial color={theme.alarm} wireframe transparent opacity={0.9} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function Warehouse() {
  const config = useStore((s) => s.config);
  if (!config) return null;
  return (
    <group>
      <RackStructure config={config} />
      <GuideRails config={config} />
      <SafetyFence config={config} />
      <Pallets config={config} />
      <ExceptionMarkers config={config} />
      <IOStation config={config} />
    </group>
  );
}
