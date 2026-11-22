import { STATUS } from '../config';
import type { ProjectCard } from '../types';

/** Dibujo vectorial del loteo, coloreado por estado (para las tarjetas). */
export function LotsPreview({ preview, className = '' }: { preview: ProjectCard['preview']; className?: string }) {
  const pad = Math.max(preview.w, preview.h) * 0.06;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${preview.w + pad * 2} ${preview.h + pad * 2}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <filter id="lp-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#022c22" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#lp-shadow)">
        {preview.lots.map((l, i) => (
          <path
            key={i}
            d={l.d}
            fill={STATUS[l.s].color}
            fillOpacity={0.9}
            stroke="#fff"
            strokeWidth={Math.max(preview.w, preview.h) / 400}
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  );
}
