import { Layers, MapPin, Palmtree, Route, Sparkles, Sun, Waves, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SITE, STATUS } from '../config';
import { cx } from '../lib/format';
import type { LotStatus } from '../types';

export function BrandMark({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <Link to="/" className={cx('group flex items-center gap-2.5', className)} aria-label={`${SITE.name} – inicio`}>
      <span className="from-brand-400 to-brand-700 shadow-glow relative grid size-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br transition-transform group-hover:scale-105">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
          <path d="M5 23 14 8l13 15z" fill="#ecfdf5" />
          <path d="M5 23h22v3H5z" fill="#a7f3d0" />
          <circle cx="23" cy="9" r="3" fill="#fde68a" />
        </svg>
      </span>
      <span className={cx('text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-brand-950')}>
        Visor<span className={light ? 'text-brand-300' : 'text-brand-600'}>Lotes</span>
      </span>
    </Link>
  );
}

export function StatusDot({ status, className = '' }: { status: LotStatus; className?: string }) {
  return <span className={cx('inline-block size-2.5 rounded-full', className)} style={{ background: STATUS[status].color }} />;
}

export function StatusBadge({ status }: { status: LotStatus }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        STATUS[status].soft,
      )}
    >
      <StatusDot status={status} className="size-2" />
      {STATUS[status].label}
    </span>
  );
}

const ICONS: Record<string, LucideIcon> = { waves: Waves, road: Route, layers: Layers, palmtree: Palmtree, sun: Sun, pin: MapPin };
export const HighlightIcon = ({ name, className }: { name: string; className?: string }) => {
  const I = ICONS[name] ?? Sparkles;
  return <I className={className} />;
};

/** Barra apilada de disponibilidad */
export function AvailabilityBar({
  available,
  reserved,
  sold,
  className = '',
}: {
  available: number;
  reserved: number;
  sold: number;
  className?: string;
}) {
  const total = available + reserved + sold || 1;
  return (
    <div className={cx('flex h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className="bg-available transition-all duration-700" style={{ width: `${(available / total) * 100}%` }} />
      <div className="bg-reserved transition-all duration-700" style={{ width: `${(reserved / total) * 100}%` }} />
      <div className="bg-sold transition-all duration-700" style={{ width: `${(sold / total) * 100}%` }} />
    </div>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-brand-600 text-sm font-bold tracking-[0.2em] uppercase">{eyebrow}</p>
      <h2 className="text-brand-950 mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-lg text-slate-600">{children}</p>}
    </div>
  );
}

export function WhatsAppIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.5h-.01a9.43 9.43 0 0 1-4.8-1.32l-.35-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44a9.38 9.38 0 0 1 6.68 2.77 9.38 9.38 0 0 1 2.76 6.68c0 5.21-4.24 9.44-9.45 9.44zm8.04-17.48A11.3 11.3 0 0 0 12.05.7C5.78.7.68 5.8.68 12.06c0 2 .52 3.96 1.52 5.68L.58 23.7l6.1-1.6a11.33 11.33 0 0 0 5.37 1.37h.01c6.26 0 11.36-5.1 11.36-11.36a11.3 11.3 0 0 0-3.33-8.04z" />
    </svg>
  );
}
