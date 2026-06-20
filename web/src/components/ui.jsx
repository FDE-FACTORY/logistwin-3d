import { theme } from '../theme.js';

/** 관제 패널 — 솔리드 그래파이트 + 스틸 보더. */
export function Panel({ className = '', title, right, children }) {
  return (
    <div className={`panel ${className}`}>
      {title && (
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{ borderColor: theme.border }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: theme.textDim }}>
            {title}
          </span>
          {right}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

/** 미세 라벨 (대문자 트래킹). */
export function Label({ children }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: theme.textFaint }}>
      {children}
    </span>
  );
}

/** 지표 — 라벨 + 큰 수치 + 단위. */
export function Stat({ label, value, unit, color }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label>{label}</Label>
      <span className="tnum text-lg font-semibold leading-none" style={{ color: color || theme.text }}>
        {value}
        {unit && (
          <span className="ml-0.5 text-[11px] font-normal" style={{ color: theme.textDim }}>
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

/** 상태 점. */
export function Dot({ color, pulse }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${pulse ? 'alarm-pulse' : ''}`}
      style={{ background: color, boxShadow: `0 0 6px ${color}66` }}
    />
  );
}

/** 관제 버튼 — variant: action(앰버) / primary(블루) / danger(적색) / ghost. */
export function Btn({ variant = 'ghost', onClick, disabled, children, full }) {
  const styles = {
    action: { bg: theme.caution, fg: '#1a1205', border: theme.caution },
    primary: { bg: theme.info, fg: '#06121f', border: theme.info },
    danger: { bg: theme.alarm, fg: '#1f0606', border: theme.alarm },
    ghost: { bg: 'transparent', fg: theme.text, border: theme.borderStrong },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-2 text-xs font-semibold transition active:translate-y-px disabled:opacity-40 ${
        full ? 'w-full' : ''
      }`}
      style={{ background: styles.bg, color: styles.fg, border: `1px solid ${styles.border}` }}
    >
      {children}
    </button>
  );
}
