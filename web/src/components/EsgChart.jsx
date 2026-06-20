import { theme } from '../theme.js';

/**
 * 경량 SVG 스파크라인(면적형) — 외부 차트 라이브러리 없이 시계열을 표시.
 * @param {object} p
 * @param {number[]} p.values 시계열 값
 * @param {string} p.color 선/면 색
 * @param {string} p.label 라벨
 * @param {string} p.current 현재값 표시 문자열
 */
export default function EsgChart({ values, color, label, current, height = 44 }) {
  const w = 100;
  const h = height;
  const pad = 3;
  const n = values.length;
  let path = '';
  let area = '';
  if (n >= 2) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const sx = (i) => pad + (i / (n - 1)) * (w - pad * 2);
    const sy = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
    path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
    area = `${path} L${sx(n - 1).toFixed(1)},${h - pad} L${sx(0).toFixed(1)},${h - pad} Z`;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: theme.textFaint }}>
          {label}
        </span>
        <span className="tnum text-xs font-semibold" style={{ color }}>
          {current}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-11 w-full">
        {n >= 2 ? (
          <>
            <path d={area} fill={color} opacity="0.14" />
            <path d={path} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          <text x={w / 2} y={h / 2} textAnchor="middle" fontSize="7" fill={theme.textFaint}>
            데이터 수집 중
          </text>
        )}
      </svg>
    </div>
  );
}
