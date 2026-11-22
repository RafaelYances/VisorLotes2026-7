import { northAngle } from '../lib/geo';
import { ROOM_STYLE, type Fit, type HouseDesign } from '../lib/houses';
import type { Lot } from '../types';

interface Props {
  lot: Lot;
  house?: HouseDesign | null;
  fit?: Fit | null;
  showBuildable?: boolean;
  className?: string;
  compact?: boolean;
}

const fmt = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });

/** Plano a escala del lote: x→ derecha, y (fondo) ↑. La vía queda abajo. */
export function LotPlan({ lot, house: design, fit, showBuildable, className = '', compact }: Props) {
  const house = design && fit ? fit.house : design;
  const xs = lot.local.map((p) => p[0]),
    ys = lot.local.map((p) => p[1]);
  const W = Math.max(...xs),
    H = Math.max(...ys);
  const size = Math.max(W, H);
  const pad = size * (compact ? 0.22 : 0.3);
  const street = lot.sides.some((s) => s.role === 'frente' && s.colinda === 'Vía');
  const streetH = size * 0.1;
  const Y = (y: number) => H - y; // SVG invertido
  const fs = size * 0.052; // tamaño de fuente base (metros)
  const pts = lot.local.map(([x, y]) => `${x},${Y(y)}`).join(' ');
  const vbX = -pad,
    vbY = -pad,
    vbW = W + pad * 2,
    vbH = H + pad * 2 + (street ? streetH * 0.6 : 0);
  const north = northAngle(lot);

  // Árboles decorativos en el patio si hay casa
  const trees: { x: number; y: number; r: number }[] = [];
  if (house && fit?.fits) {
    const backY = fit.y + house.depth;
    const free = H - backY;
    if (free > 2.5) {
      const n = Math.max(1, Math.floor(W / 4));
      for (let i = 0; i < n; i++)
        trees.push({ x: (W / (n + 1)) * (i + 1), y: backY + free / 2 + (i % 2 ? 0.6 : -0.6), r: Math.min(1.6, free / 2.6) });
    }
    const sideFree = fit.x; // espacio libre a la izquierda de la casa
    if (sideFree > 2.5) trees.push({ x: sideFree / 2, y: fit.y / 2 + 0.2, r: 1 });
  }

  return (
    <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className={className} role="img" aria-label={`Plano del lote ${lot.numero}`}>
      <defs>
        <pattern id={`grass-${lot.id}`} width={1.2} height={1.2} patternUnits="userSpaceOnUse">
          <rect width={1.2} height={1.2} fill="#ecfdf5" />
          <circle cx={0.3} cy={0.3} r={0.08} fill="#a7f3d0" />
          <circle cx={0.9} cy={0.85} r={0.06} fill="#6ee7b7" />
        </pattern>
        <pattern id={`hatch-${lot.id}`} width={0.8} height={0.8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={0.8} stroke="#fbbf24" strokeWidth={0.12} opacity={0.5} />
        </pattern>
        <filter id={`sh-${lot.id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx={0} dy={size * 0.006} stdDeviation={size * 0.008} floodColor="#022c22" floodOpacity={0.25} />
        </filter>
      </defs>

      {/* Vía */}
      {street && (
        <g>
          <rect x={vbX} y={H + pad * 0.42} width={vbW} height={streetH} fill="#e2e8f0" rx={size * 0.01} />
          <line
            x1={vbX}
            x2={vbX + vbW}
            y1={H + pad * 0.42 + streetH / 2}
            y2={H + pad * 0.42 + streetH / 2}
            stroke="#fff"
            strokeWidth={size * 0.006}
            strokeDasharray={`${size * 0.03} ${size * 0.02}`}
          />
          <text
            x={W / 2}
            y={H + pad * 0.42 + streetH / 2}
            dy="0.35em"
            textAnchor="middle"
            fontSize={fs * 0.85}
            fontWeight={700}
            fill="#64748b"
            letterSpacing={fs * 0.2}
          >
            VÍA
          </text>
        </g>
      )}

      {/* Lote */}
      <polygon
        points={pts}
        fill={`url(#grass-${lot.id})`}
        stroke="#047857"
        strokeWidth={size * 0.008}
        strokeLinejoin="round"
        filter={`url(#sh-${lot.id})`}
      />

      {/* Zona de retiros y área construible */}
      {(showBuildable || house) && fit && (
        <g>
          <rect
            x={fit.buildable.x}
            y={Y(fit.buildable.y + fit.buildable.h)}
            width={fit.buildable.w}
            height={fit.buildable.h}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={size * 0.004}
            strokeDasharray={`${size * 0.015} ${size * 0.01}`}
          />
          {!house && (
            <rect
              x={fit.buildable.x}
              y={Y(fit.buildable.y + fit.buildable.h)}
              width={fit.buildable.w}
              height={fit.buildable.h}
              fill={`url(#hatch-${lot.id})`}
            />
          )}
        </g>
      )}

      {/* Casa */}
      {house && fit && (
        <g transform={`translate(${fit.x} ${Y(fit.y)})`} opacity={fit.fits ? 1 : 0.88}>
          {house.rooms.map((r, i) => {
            const st = ROOM_STYLE[r.kind];
            const rx = r.x,
              ry = -(r.y + r.h);
            const label = r.label;
            const maxF = Math.min(r.w / (label.length * 0.55), r.h / 2.2, fs * 0.75);
            return (
              <g key={i}>
                <rect
                  x={rx}
                  y={ry}
                  width={r.w}
                  height={r.h}
                  fill={st.fill}
                  stroke={r.kind === 'outdoor' || r.kind === 'garden' ? '#d6b98c' : r.kind === 'pool' ? '#0284c7' : '#334155'}
                  strokeWidth={r.kind === 'outdoor' || r.kind === 'garden' ? size * 0.002 : size * 0.0045}
                  rx={r.kind === 'pool' ? 0.3 : 0}
                />
                {maxF > fs * 0.3 && (
                  <text x={rx + r.w / 2} y={ry + r.h / 2} dy="0.35em" textAnchor="middle" fontSize={maxF} fontWeight={600} fill={st.text}>
                    {label}
                  </text>
                )}
              </g>
            );
          })}
          {/* contorno de la huella */}
          <rect
            x={0}
            y={-house.depth}
            width={house.width}
            height={house.depth}
            fill="none"
            stroke={fit.fits ? house.accent : '#ef4444'}
            strokeWidth={size * 0.006}
            strokeDasharray={fit.fits ? undefined : `${size * 0.02} ${size * 0.012}`}
          />
        </g>
      )}

      {trees.map((t, i) => (
        <g key={i}>
          <circle cx={t.x} cy={Y(t.y)} r={t.r} fill="#34d399" opacity={0.85} />
          <circle cx={t.x - t.r * 0.25} cy={Y(t.y) - t.r * 0.25} r={t.r * 0.45} fill="#6ee7b7" opacity={0.9} />
        </g>
      ))}

      {/* Medidas de cada lado */}
      {lot.local.map(([x1, y1], i) => {
        const [x2, y2] = lot.local[(i + 1) % lot.local.length];
        const side = lot.sides[i];
        if (!side || side.length < size * 0.06) return null;
        const mx = (x1 + x2) / 2,
          my = (Y(y1) + Y(y2)) / 2;
        const dx = x2 - x1,
          dy = Y(y2) - Y(y1);
        const len = Math.hypot(dx, dy);
        // normal hacia afuera: comparar con el centro
        let nx = dy / len,
          ny = -dx / len;
        const cxp = W / 2,
          cyp = H / 2;
        if ((mx + nx - cxp) ** 2 + (my + ny - cyp) ** 2 < (mx - cxp) ** 2 + (my - cyp) ** 2) {
          nx = -nx;
          ny = -ny;
        }
        let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (ang > 90) ang -= 180;
        if (ang < -90) ang += 180;
        const off = size * 0.06;
        const off2 = size * 0.135;
        return (
          <g key={i}>
            <text
              transform={`translate(${mx + nx * off} ${my + ny * off}) rotate(${ang})`}
              textAnchor="middle"
              dy="0.35em"
              fontSize={fs}
              fontWeight={800}
              fill="#065f46"
            >
              {fmt(side.length)} m
            </text>
            {!compact && !(street && side.role === 'frente' && side.colinda === 'Vía') && (
              <text
                transform={`translate(${mx + nx * off2} ${my + ny * off2}) rotate(${ang})`}
                textAnchor="middle"
                dy="0.35em"
                fontSize={fs * 0.7}
                fontWeight={500}
                fill="#64748b"
              >
                {side.colinda}
              </text>
            )}
          </g>
        );
      })}

      {/* Área al centro (si no hay casa) */}
      {!house && (
        <g>
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={fs * 1.7} fontWeight={800} fill="#047857">
            {fmt(lot.area)} m²
          </text>
          <text
            x={W / 2}
            y={H / 2 + fs * 1.6}
            textAnchor="middle"
            fontSize={fs * 0.85}
            fontWeight={600}
            fill="#059669"
            letterSpacing={fs * 0.05}
          >
            LOTE {lot.numero} · MZ {lot.manzana}
          </text>
        </g>
      )}

      {/* Norte */}
      <g transform={`translate(${W + pad * 0.55} ${vbY + pad * 0.5})`}>
        <circle r={fs * 1.4} fill="#fff" stroke="#d1fae5" strokeWidth={fs * 0.08} />
        <g transform={`rotate(${north})`}>
          <path d={`M0 ${-fs * 1.05} L${fs * 0.5} ${fs * 0.55} L0 ${fs * 0.25} L${-fs * 0.5} ${fs * 0.55} Z`} fill="#059669" />
        </g>
        <text y={fs * 2.3} textAnchor="middle" fontSize={fs * 0.75} fontWeight={800} fill="#065f46">
          N
        </text>
      </g>

      {/* Escala */}
      <g transform={`translate(${vbX + pad * 0.3} ${vbY + pad * 0.45})`}>
        <rect width={5} height={fs * 0.3} fill="#065f46" />
        <rect x={5} width={5} height={fs * 0.3} fill="#a7f3d0" />
        <text y={-fs * 0.45} fontSize={fs * 0.7} fill="#475569" fontWeight={600}>
          0
        </text>
        <text x={10} y={-fs * 0.45} fontSize={fs * 0.7} fill="#475569" fontWeight={600} textAnchor="middle">
          10 m
        </text>
      </g>
    </svg>
  );
}
