/**
 * 평면도 → AS/RS 레이아웃 임포트 CLI.
 *
 * 건물 평면도(외곽 치수)로부터 랙 레이아웃(통로×베이×층)을 자동 설계하고,
 * 시뮬레이터가 바로 쓸 수 있는 layout JSON(warehouse.config 호환)을 생성합니다.
 *
 * 입력 모드:
 *   1) DXF 자동:   --dxf <파일>            (도면에서 외곽 치수 추출)
 *   2) 수동 치수:  --width <m> --depth <m> (PDF/이미지/DWG는 치수만 보고 입력)
 * 공통 옵션:
 *   --height <m>   천장고 (층수 산출, 미입력 시 기본 8층)
 *   --units <mm|cm|m|in|ft>  DXF 단위 강제 (기본: $INSUNITS 또는 mm)
 *   --name "..."   창고 이름
 *   --out <파일>   출력 경로 (기본 generated/<slug>.layout.json)
 *
 * 실행 예:
 *   npm run import-layout -- --dxf samples/floorplan.dxf --height 9 --name "인천 DC"
 *   npm run import-layout -- --width 80 --depth 45 --height 10
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { envelopeFromDxf } from './dxfParser.js';
import { generateLayout } from './layoutGenerator.js';

const UNIT_SCALE = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

function parseArgs(argv) {
  const out = {};
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a[i]);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val === undefined) {
      // 다음 토큰이 값인지(플래그가 아닌지) 확인
      if (a[i + 1] !== undefined && !a[i + 1].startsWith('--')) val = a[++i];
      else val = true;
    }
    out[key] = val;
  }
  return out;
}

const args = parseArgs(process.argv);
const name = args.name || 'Imported DC';
const clearHeight = args.height !== undefined ? Number(args.height) : undefined;
const unitsOverride = args.units ? UNIT_SCALE[args.units] : undefined;

let envelope;
let source;
let columns = [];
try {
  if (args.dxf) {
    const text = readFileSync(args.dxf, 'utf8');
    const env = envelopeFromDxf(text, unitsOverride);
    envelope = { width: env.width, depth: env.depth, clearHeight };
    columns = env.columns;
    source = `DXF(${args.dxf}) │ 단위 ${args.units || (env.units ? `code ${env.units}` : 'mm 추정')} │ 레이어 [${env.layers.join(', ')}]`;
  } else if (args.width && args.depth) {
    envelope = { width: Number(args.width), depth: Number(args.depth), clearHeight };
    source = `수동 치수 입력`;
  } else {
    console.error('사용법: --dxf <파일>  또는  --width <m> --depth <m>  [--height <m>] [--name "..."]');
    process.exit(1);
  }

  const { config, report } = generateLayout(envelope, {}, { name });

  // ── 리포트 출력 ──────────────────────────────────────────────
  const r = report;
  console.log('═'.repeat(68));
  console.log(`🏗️  평면도 → AS/RS 레이아웃 자동 설계`);
  console.log(`    소스: ${source}`);
  console.log('═'.repeat(68));
  console.log(`   건물 외곽      : ${r.envelope.width.toFixed(1)} × ${r.envelope.depth.toFixed(1)} m` + (r.envelope.clearHeight ? ` × H${r.envelope.clearHeight}m` : ' (천장고 미입력 → 기본 8층)'));
  console.log(`   바닥 면적      : ${r.floorAreaM2.toLocaleString()} m²`);
  if (columns.length) console.log(`   감지된 기둥    : ${columns.length}개 (현재 배치는 외곽 기준, 기둥 회피는 향후)`);
  console.log('   ' + '─'.repeat(60));
  console.log(`   설계 결과      : ${r.fit.aisles} 통로 × 2 면 × ${r.fit.baysPerSide} 베이 × ${r.fit.levels} 층`);
  console.log(`   총 저장 셀     : ${r.totalCells.toLocaleString()} 셀`);
  console.log(`   저장 밀도      : ${r.storageDensityPerM2} 셀/m² (고층 누적)`);
  console.log(`   공간 활용률    : ${(r.spaceUtilization * 100).toFixed(0)}%  (사용 ${r.usedFootprintM2.toLocaleString()} / ${r.floorAreaM2.toLocaleString()} m²)`);
  console.log(`   잔여 여백      : 폭 ${r.leftover.widthM}m · 깊이 ${r.leftover.depthM}m`);
  console.log('═'.repeat(68));

  // ── 출력 파일 ────────────────────────────────────────────────
  const slug = name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '') || 'layout';
  const outPath = args.out || join('generated', `${slug}.layout.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ config, report, source, generatedAt: null }, null, 2), 'utf8');
  console.log(`✅ 레이아웃 저장: ${outPath}`);
  console.log(`   이 레이아웃으로 시뮬레이션:`);
  console.log(`     npm start -- --layout=${outPath}`);
  console.log(`     npm run serve   (환경변수 LAYOUT=${outPath})`);
} catch (err) {
  console.error(`❌ 임포트 실패: ${err.message}`);
  process.exit(1);
}
