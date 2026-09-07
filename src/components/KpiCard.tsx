import React from 'react';
import { Badge, cx, type Tone } from '@/components/ui/Primitives';
import { IconArrowDown, IconArrowUp } from '@/components/Icons';

/**
 * A stat tile: the headline figure is the point, so it gets the visual weight.
 * Deltas carry an arrow as well as a colour, so the change never reads by hue alone.
 */
export function KpiCard({
  label, value, delta, deltaLabel, hint, status, tone, icon, footer, deltaGoodWhen = 'up', onClick,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  /** Descriptive line under the figure. Wraps freely. */
  hint?: string;
  /** Short state word shown as a chip beside the label. Keep it to one or two words. */
  status?: string;
  tone?: Tone;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  deltaGoodWhen?: 'up' | 'down';
  onClick?: () => void;
}) {
  const up = (delta ?? 0) >= 0;
  const good = deltaGoodWhen === 'up' ? up : !up;
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cx(
        'card card-pad flex w-full flex-col gap-2 text-left transition-shadow',
        onClick && 'hover:shadow-pop active:scale-[0.995]',
      )}
    >
      {/* The label gets the full width — a status chip beside it would squeeze
          it into an ellipsis on a narrow phone card, so it lives below instead. */}
      <div className="flex items-start gap-1.5">
        {icon && <span className="mt-px shrink-0 text-subtle">{icon}</span>}
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-subtle">{label}</span>
      </div>

      <p className="text-xl font-bold leading-none tnum text-ink sm:text-2xl">{value}</p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {status && tone && <Badge tone={tone}>{status}</Badge>}
        {delta !== undefined && delta !== null && (
          <span className={cx('flex items-center gap-1 text-xs font-semibold', good ? 'text-good' : 'text-critical')}>
            {up ? <IconArrowUp width={13} height={13} /> : <IconArrowDown width={13} height={13} />}
            {Math.abs(delta)}%
            {deltaLabel && <span className="font-medium text-subtle">{deltaLabel}</span>}
          </span>
        )}
      </div>

      {hint && <p className="text-xs leading-snug text-muted">{hint}</p>}
      {footer}
    </Wrapper>
  );
}
