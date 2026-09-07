import React from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({
  children, className, title, subtitle, action, dense,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className={cx('flex items-start justify-between gap-3 border-b border-line', dense ? 'px-4 py-3' : 'px-4 sm:px-5 py-3.5')}>
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={dense ? 'p-3 sm:p-4' : 'card-pad'}>{children}</div>
    </section>
  );
}

export function Button({
  variant = 'ghost', className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'quiet' | 'danger' }) {
  const base =
    variant === 'primary' ? 'btn-primary'
    : variant === 'danger' ? 'btn border border-critical/40 bg-critical/10 text-critical hover:bg-critical/20'
    : variant === 'quiet' ? 'btn-quiet'
    : 'btn-ghost';
  return <button type="button" className={cx(base, className)} {...rest} />;
}

export function Field({
  label, hint, error, children, className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-critical">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

export function Select({
  options, className, ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }> }) {
  return (
    <select className={cx('input appearance-none pr-8', className)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <div className={cx('inline-flex rounded-pill border border-line bg-raised p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap',
            value === o.value ? 'bg-accent text-white' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TONES = {
  good: 'bg-good/12 text-good border-good/30',
  warning: 'bg-warning/15 text-warning border-warning/35',
  serious: 'bg-serious/15 text-serious border-serious/35',
  critical: 'bg-critical/12 text-critical border-critical/30',
  neutral: 'bg-line/50 text-muted border-line',
  accent: 'bg-accent/12 text-accent border-accent/30',
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  tone = 'neutral', children, icon, className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-semibold', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Progress({
  value, tone = 'accent', className, showTrack = true,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  showTrack?: boolean;
}) {
  const colors: Record<Tone, string> = {
    good: 'bg-good', warning: 'bg-warning', serious: 'bg-serious',
    critical: 'bg-critical', neutral: 'bg-subtle', accent: 'bg-accent',
  };
  return (
    <div
      className={cx('h-2 w-full overflow-hidden rounded-pill', showTrack && 'bg-line/70', className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cx('h-full rounded-pill transition-[width] duration-500', colors[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function EmptyState({
  icon, title, detail, action,
}: {
  icon?: React.ReactNode;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-3xl opacity-70">{icon}</div>}
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {detail && <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          'relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-pop animate-slide-in sm:rounded-card sm:animate-fade-up',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-plane hover:text-ink" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</footer>}
      </div>
    </div>
  );
}

export function Toggle({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-pill transition-colors', checked ? 'bg-accent' : 'bg-line')}
    >
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

export function Sparkline({ values, tone = 'accent', className }: { values: number[]; tone?: 'accent' | 'good' | 'critical'; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`)
    .join(' ');
  const stroke = tone === 'good' ? 'rgb(var(--good))' : tone === 'critical' ? 'rgb(var(--critical))' : 'rgb(var(--accent))';
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cx('h-8 w-full', className)} aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
