/**
 * 최소 DXF 파서 — 건물 평면도에서 외곽 치수(bounding box)와 기둥(원)을 추출.
 *
 * DXF는 (그룹코드, 값)이 줄 단위로 번갈아 나오는 ASCII 포맷입니다. 본 파서는 ENTITIES
 * 섹션의 LINE / LWPOLYLINE / CIRCLE 좌표를 모아 전체 경계 상자(건물 외곽)를 계산합니다.
 * 평면도엔 랙이 없으므로(기본 평면도), 외곽 치수만 얻어 레이아웃 생성기에 넘깁니다.
 *
 * 한계: 임의의 복잡한 도면을 완벽 해석하지는 않습니다. 외곽선이 ENTITIES의 선/폴리라인으로
 * 그려진 일반적 평면도를 대상으로 합니다.
 */

/** $INSUNITS 코드 → 미터 환산 계수. */
const UNIT_TO_M = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 }; // in, ft, mm, cm, m

export function unitScaleToMeters(insUnits) {
  return UNIT_TO_M[insUnits] ?? null;
}

/**
 * DXF 텍스트 파싱.
 * @param {string} text DXF 파일 내용
 * @returns {{ bbox: ?object, circles: object[], layers: string[], units: ?number }}
 */
export function parseDxf(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push([code, (lines[i + 1] ?? '').trim()]);
  }

  let section = null;
  let entity = null;
  let layer = '0';
  let units = null;
  let headerVar = null;
  let pendingX = null;
  let pendingX2 = null;
  let curCircle = null;

  const xs = [];
  const ys = [];
  const circles = [];
  const layers = new Set();

  const inEntities = () => section === 'ENTITIES';

  for (const [code, val] of pairs) {
    if (code === 0) {
      if (val === 'SECTION' || val === 'ENDSEC' || val === 'EOF') {
        if (val === 'ENDSEC') section = null;
        entity = null;
      } else {
        entity = val; // 엔티티 타입 (LINE/LWPOLYLINE/CIRCLE/INSERT...)
      }
      curCircle = null;
      pendingX = pendingX2 = null;
      continue;
    }
    if (code === 2 && entity === null) {
      section = val; // 섹션 이름 (HEADER/ENTITIES/BLOCKS...)
      continue;
    }
    if (code === 9) {
      headerVar = val;
      continue;
    }
    if (headerVar === '$INSUNITS' && code === 70) {
      units = parseInt(val, 10);
      headerVar = null;
      continue;
    }
    if (code === 8) {
      layer = val;
      layers.add(val);
      continue;
    }
    if (!inEntities()) continue; // 좌표는 ENTITIES 섹션만 수집

    if (code === 10) {
      pendingX = parseFloat(val);
    } else if (code === 20) {
      if (pendingX !== null) {
        xs.push(pendingX);
        ys.push(parseFloat(val));
        if (entity === 'CIRCLE') curCircle = { x: pendingX, y: parseFloat(val), layer };
        pendingX = null;
      }
    } else if (code === 11) {
      pendingX2 = parseFloat(val);
    } else if (code === 21) {
      if (pendingX2 !== null) {
        xs.push(pendingX2);
        ys.push(parseFloat(val));
        pendingX2 = null;
      }
    } else if (code === 40 && entity === 'CIRCLE' && curCircle) {
      circles.push({ ...curCircle, r: parseFloat(val) });
      curCircle = null;
    }
  }

  const bbox =
    xs.length > 0
      ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
      : null;

  return { bbox, circles, layers: [...layers], units };
}

/**
 * DXF 텍스트 → 건물 외곽(미터) 추출.
 * @param {string} text
 * @param {number} [unitsOverride] $INSUNITS 무시하고 강제할 단위 계수(mm=0.001 등)
 * @returns {{ width, depth, circles, raw }}
 */
export function envelopeFromDxf(text, unitsOverride) {
  const parsed = parseDxf(text);
  if (!parsed.bbox) throw new Error('DXF에서 외곽 좌표를 찾지 못했습니다 (ENTITIES의 LINE/LWPOLYLINE 필요).');
  const scale = unitsOverride ?? unitScaleToMeters(parsed.units) ?? 0.001; // 기본 mm 가정
  const width = (parsed.bbox.maxX - parsed.bbox.minX) * scale;
  const depth = (parsed.bbox.maxY - parsed.bbox.minY) * scale;
  return {
    width,
    depth,
    scale,
    columns: parsed.circles.map((c) => ({ x: c.x * scale, y: c.y * scale, r: c.r * scale })),
    layers: parsed.layers,
    units: parsed.units,
  };
}
