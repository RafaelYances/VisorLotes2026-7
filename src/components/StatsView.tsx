import { BarChart3, Check, Copy, Eye, Home, Loader2, MapPin, MessageCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { STATUS } from '../config';
import { cx, num } from '../lib/format';
import type { Lot } from '../types';
import { StatusDot } from './ui';

export interface StatsReport {
  days: number;
  from: string;
  to: string;
  totals: { visitors: number; lotViews: number; whatsapp: number; houses: number; shares: number };
  previous: { visitors: number; whatsapp: number };
  daily: { day: string; visitors: number; whatsapp: number }[];
  topLots: { lot: string; views: number; whatsapp: number }[];
}

const SERIES = '#059669'; // un solo color de datos (validado: contraste y luminosidad)
const RANGES = [7, 30, 90] as const;

const fmtDay = (d: string, long = false) => {
  const t = new Date(`${d}T12:00:00`).toLocaleDateString(
    'es-CO',
    long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' },
  );
  return long ? t.charAt(0).toUpperCase() + t.slice(1) : t; // "Mié, 18 de nov"
};

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function Delta({ now, before }: { now: number; before: number }) {
  if (!before && !now) return null;
  if (!before) return <span className="text-brand-700 text-[11px] font-bold">nuevo</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-[11px] font-bold', up ? 'text-brand-700' : 'text-slate-500')}>
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? '+' : ''}
      {pct}% vs. periodo anterior
    </span>
  );
}

function Tile({ icon: I, label, value, sub }: { icon: typeof Eye; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-200">
      <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
        <I className="size-3.5" /> {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 min-h-4">{sub}</div>}
    </div>
  );
}

/** Columnas por día (una serie: visitantes), con tooltip y vista de tabla. */
function DailyChart({ data }: { data: StatsReport['daily'] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 170,
    padL = 30,
    padB = 22,
    padT = 8;
  const max = niceMax(Math.max(...data.map((d) => d.visitors), 0));
  const ticks = [0, max / 2, max];
  const plotW = w - padL - 4;
  const slot = plotW / data.length;
  const barW = Math.max(2, Math.min(24, slot - 2)); // ≤ 24px, con 2px de aire entre columnas
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const labelIdx = data.length <= 7 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1];
  const h = hover != null ? data[hover] : null;

  return (
    <div ref={wrap} className="relative">
      <svg width={w} height={H} role="img" aria-label="Visitantes por día" className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="#eef2f6" strokeWidth={1} />
            <text x={padL - 6} y={y(t)} dy="0.35em" textAnchor="end" fontSize={10} fill="#64748b">
              {num(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const top = y(d.visitors);
          const bh = H - padB - top;
          const r = Math.min(4, barW / 2, bh);
          return (
            <g key={d.day}>
              {d.visitors > 0 && (
                <path
                  d={`M${x},${H - padB} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${H - padB} Z`}
                  fill={SERIES}
                  opacity={hover == null || hover === i ? 1 : 0.45}
                />
              )}
              {/* zona de hover más grande que la columna */}
              <rect
                x={padL + i * slot}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(i)}
              />
            </g>
          );
        })}
        <line x1={padL} x2={w} y1={H - padB} y2={H - padB} stroke="#cbd5e1" strokeWidth={1} />
        {labelIdx.map((i) => (
          <text
            key={i}
            x={padL + i * slot + slot / 2}
            y={H - 6}
            textAnchor={i === 0 && data.length > 7 ? 'start' : i === data.length - 1 && data.length > 7 ? 'end' : 'middle'}
            fontSize={10}
            fill="#64748b"
          >
            {fmtDay(data[i].day)}
          </text>
        ))}
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.min(Math.max(padL + hover * slot + slot / 2 - 70, 0), w - 140), width: 140 }}
        >
          <div className="font-bold">{fmtDay(h.day, true)}</div>
          <div className="mt-0.5 flex justify-between">
            <span className="text-slate-300">Visitantes</span>
            <b>{h.visitors}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-300">WhatsApp</span>
            <b>{h.whatsapp}</b>
          </div>
        </div>
      )}
    </div>
  );
}

export function StatsView({
  projectName,
  lots,
  load,
  audience,
}: {
  projectName: string;
  lots: Lot[];
  load: (days: number) => Promise<StatsReport>;
  /** 'owner': textos para el dueño; 'admin': incluye botón para copiar el reporte */
  audience: 'owner' | 'admin';
}) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<StatsReport | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const byId = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots]);

  useEffect(() => {
    setData(null);
    setError('');
    load(days)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas'));
  }, [days, load]);

  const t = data?.totals;
  const conv = t && t.visitors ? Math.round((t.whatsapp / t.visitors) * 100) : 0;
  const lotName = (id: string) => {
    const l = byId.get(id);
    return l ? `Lote ${l.numero} · Mz ${l.manzana}` : id;
  };
  const maxViews = Math.max(1, ...(data?.topLots.map((l) => l.views) ?? [1]));

  const report = () => {
    if (!data || !t) return '';
    const lines = [
      `📊 *${projectName}* — últimos ${days} días`,
      `👀 ${num(t.visitors)} personas vieron el proyecto`,
      `📐 ${num(t.lotViews)} consultas de lotes`,
      `💬 ${num(t.whatsapp)} contactos por WhatsApp`,
      t.houses ? `🏠 ${num(t.houses)} probaron diseños de casa` : '',
      data.topLots[0] ? `⭐ Lote más visto: ${lotName(data.topLots[0].lot)} (${data.topLots[0].views} consultas)` : '',
    ];
    return lines.filter(Boolean).join('\n');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
          <BarChart3 className="text-brand-600 size-5" /> Estadísticas
        </h3>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-bold transition',
                days === r ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {r} días
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {!data && !error && <Loader2 className="mx-auto my-10 size-6 animate-spin text-slate-400" />}

      {data && t && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Tile icon={Eye} label="Visitantes" value={num(t.visitors)} sub={<Delta now={t.visitors} before={data.previous.visitors} />} />
            <Tile
              icon={MessageCircle}
              label="WhatsApp"
              value={num(t.whatsapp)}
              sub={t.visitors ? <span className="text-[11px] font-semibold text-slate-500">{conv}% de los visitantes escribió</span> : null}
            />
            <Tile icon={MapPin} label="Lotes consultados" value={num(t.lotViews)} />
            <Tile icon={Home} label="Diseños de casa" value={num(t.houses)} />
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="mb-2 text-sm font-bold text-slate-800">Visitantes por día</div>
            {t.visitors === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Aún no hay visitas en este periodo. Comparte el enlace del proyecto para empezar a ver datos.
              </p>
            ) : (
              <DailyChart data={data.daily} />
            )}
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold">Ver como tabla</summary>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-1 font-semibold">Día</th>
                    <th className="py-1 text-right font-semibold">Visitantes</th>
                    <th className="py-1 text-right font-semibold">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.daily].reverse().map((d) => (
                    <tr key={d.day} className="border-t border-slate-100 text-slate-700">
                      <td className="py-1">{fmtDay(d.day, true)}</td>
                      <td className="py-1 text-right tabular-nums">{d.visitors}</td>
                      <td className="py-1 text-right tabular-nums">{d.whatsapp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="mb-3 text-sm font-bold text-slate-800">Lotes más consultados</div>
            {data.topLots.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Todavía nadie ha abierto un lote en este periodo.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.topLots.map((r) => {
                  const l = byId.get(r.lot);
                  return (
                    <li key={r.lot}>
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-800">
                          {l && <StatusDot status={l.status} />}
                          <span className="truncate">{lotName(r.lot)}</span>
                          {l && <span className="shrink-0 text-xs font-normal text-slate-500">{STATUS[l.status].label}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-slate-600 tabular-nums">
                          <b className="text-slate-900">{r.views}</b> consultas{r.whatsapp ? ` · ${r.whatsapp} WhatsApp` : ''}
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full" style={{ width: `${(r.views / maxViews) * 100}%`, background: SERIES }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {audience === 'admin' && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(report());
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{' '}
              {copied ? 'Copiado' : 'Copiar resumen para enviar al dueño'}
            </button>
          )}
          <p className="text-[11px] text-slate-400">
            Datos anónimos. Cada persona cuenta una vez por día. No se cuentan tus propias visitas
            {audience === 'admin' ? ' ni las del dueño' : ''}.
          </p>
        </>
      )}
    </div>
  );
}
