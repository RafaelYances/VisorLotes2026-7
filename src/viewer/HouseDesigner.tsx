import { BedDouble, Bath, Check, Layers3, Maximize2, MapPinned, Ruler, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx, m, m2 } from '../lib/format';
import { fitHouse, HOUSES, ROOM_STYLE, type HouseDesign } from '../lib/houses';
import type { Lot, Project } from '../types';
import { LotPlan } from './LotPlan';

interface Props {
  project: Project;
  lot: Lot;
  houseId: string | null;
  onHouse: (id: string | null) => void;
  onMap: boolean;
  onToggleMap: (v: boolean) => void;
}

export function HouseDesigner({ project, lot, houseId, onHouse, onMap, onToggleMap }: Props) {
  const fits = useMemo(() => HOUSES.map((h) => ({ h, f: fitHouse(lot, h, project.setbacks) })), [lot, project.setbacks]);
  const sel = fits.find((x) => x.h.id === houseId) ?? null;
  const [zoom, setZoom] = useState(false);
  const b = fits[0]?.f.buildable;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-amber-50/70 p-3.5 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200/60">
        <b>Área construible:</b> {b ? `${m(Math.max(0, b.w))} × ${m(Math.max(0, b.h))}` : '—'} — retiros de {project.setbacks.front} m al
        frente, {project.setbacks.back} m al fondo y {project.setbacks.side} m a los lados (referenciales; verifica la norma del municipio).
      </div>

      {/* Plano */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-50 to-white ring-1 ring-slate-200/70">
        <LotPlan lot={lot} house={sel?.h} fit={sel?.f ?? fits[0]?.f} showBuildable className="h-80 w-full" />
        <button
          onClick={() => setZoom(true)}
          className="hover:text-brand-700 absolute top-3 right-3 grid size-9 place-items-center rounded-xl bg-white/90 text-slate-700 shadow ring-1 ring-slate-200 transition"
          aria-label="Ampliar plano"
        >
          <Maximize2 className="size-4" />
        </button>
        {sel && (
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow',
                sel.f.fits ? 'bg-brand-600 text-white' : 'bg-rose-600 text-white',
              )}
            >
              {sel.f.fits ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              {sel.f.fits ? 'Cabe en este lote' : 'No cabe en este lote'}
            </span>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-700 shadow ring-1 ring-slate-200">
              <MapPinned className="text-brand-600 size-3.5" />
              Ver en el mapa
              <input type="checkbox" className="peer sr-only" checked={onMap} onChange={(e) => onToggleMap(e.target.checked)} />
              <span className="peer-checked:bg-brand-500 relative h-4 w-7 rounded-full bg-slate-300 transition after:absolute after:top-0.5 after:left-0.5 after:size-3 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-3" />
            </label>
          </div>
        )}
      </div>

      {sel && <HouseSummary house={sel.h} fit={sel.f} />}

      {/* Catálogo */}
      <div className="grid gap-3">
        {fits.map(({ h, f }) => (
          <button
            key={h.id}
            onClick={() => onHouse(houseId === h.id ? null : h.id)}
            className={cx(
              'group flex items-center gap-4 rounded-2xl p-3 text-left ring-1 transition',
              houseId === h.id ? 'bg-brand-50 ring-brand-500 ring-2' : 'hover:ring-brand-300 bg-white ring-slate-200',
            )}
          >
            <MiniHouse house={h} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-bold text-slate-900">{h.name}</span>
                <span
                  className={cx(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                    f.fits ? 'bg-brand-100 text-brand-700' : 'bg-rose-100 text-rose-700',
                  )}
                >
                  {f.fits ? 'Cabe' : 'No cabe'}
                </span>
              </div>
              <div className="text-xs text-slate-500">{h.style}</div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="size-3.5" />
                  {h.bedrooms}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Bath className="size-3.5" />
                  {h.baths}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Layers3 className="size-3.5" />
                  {h.floors} {h.floors > 1 ? 'pisos' : 'piso'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Ruler className="size-3.5" />
                  {h.width}×{h.depth} m
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {createPortal(
        <AnimatePresence>
          {zoom && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-brand-950/70 fixed inset-0 z-[60] grid place-items-center p-4 backdrop-blur-sm"
              onClick={() => setZoom(false)}
            >
              <motion.div
                initial={{ scale: 0.94, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 10 }}
                transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <div>
                    <div className="text-brand-600 text-xs font-bold tracking-wider uppercase">
                      Lote {lot.numero} · Manzana {lot.manzana}
                    </div>
                    <div className="text-brand-950 text-lg font-extrabold">{sel ? sel.h.name : 'Área construible'}</div>
                  </div>
                  <button
                    onClick={() => setZoom(false)}
                    className="grid size-10 place-items-center rounded-xl bg-slate-100 hover:bg-slate-200"
                    aria-label="Cerrar"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="grid min-h-0 flex-1 gap-0 overflow-auto md:grid-cols-[1fr_240px]">
                  <LotPlan lot={lot} house={sel?.h} fit={sel?.f ?? fits[0]?.f} showBuildable className="h-[60vh] w-full bg-slate-50" />
                  <div className="space-y-2 border-t border-slate-100 p-5 md:border-t-0 md:border-l">
                    <div className="mb-3 text-xs font-bold tracking-wider text-slate-500 uppercase">Convenciones</div>
                    {(['social', 'private', 'service', 'wet', 'outdoor', 'pool', 'circulation', 'garden'] as const).map((k) => (
                      <div key={k} className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="size-4 rounded" style={{ background: ROOM_STYLE[k].fill, outline: '1px solid #cbd5e1' }} />
                        {
                          {
                            social: 'Social',
                            private: 'Alcobas / estudio',
                            service: 'Cocina y servicios',
                            wet: 'Baños',
                            outdoor: 'Terraza / deck',
                            pool: 'Piscina',
                            circulation: 'Circulación',
                            garden: 'Patio / jardín',
                          }[k]
                        }
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2 text-sm text-slate-600">
                      <span className="h-0 w-4 border-t-2 border-dashed border-amber-500" /> Límite de retiros
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function HouseSummary({ house, fit }: { house: HouseDesign; fit: ReturnType<typeof fitHouse> }) {
  return (
    <motion.div
      key={house.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl bg-white p-4 ring-1 ring-slate-200"
    >
      <p className="text-sm leading-relaxed text-slate-600">{house.description}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Kpi label="Construido" value={m2(house.builtArea)} />
        <Kpi label="Huella" value={`${fit.house.width}×${fit.house.depth}`} />
        <Kpi label="Ocupación" value={`${Math.round(fit.occupation)}%`} />
      </div>
      {fit.rotated && (
        <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs text-sky-800">
          Para aprovechar el frente del lote, el diseño se ubicó <b>girado 90°</b>.
        </p>
      )}
      {!fit.fits && (
        <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">
          Faltan {fit.missingWidth > 0 && <b>{m(fit.missingWidth)} de ancho</b>}
          {fit.missingWidth > 0 && fit.missingDepth > 0 && ' y '}
          {fit.missingDepth > 0 && <b>{m(fit.missingDepth)} de fondo</b>}. Pregunta por la unión de lotes contiguos o una versión adaptada.
        </p>
      )}
    </motion.div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-2 py-2.5">
      <div className="text-sm font-extrabold text-slate-900">{value}</div>
      <div className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
    </div>
  );
}

/** Miniatura del plano de la casa */
function MiniHouse({ house }: { house: HouseDesign }) {
  const s = Math.max(house.width, house.depth);
  return (
    <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-slate-50 ring-1 ring-slate-100">
      <svg viewBox={`${-s * 0.08} ${-s * 0.08} ${s * 1.16} ${s * 1.16}`} className="size-14">
        <g transform={`translate(${(s - house.width) / 2} ${(s - house.depth) / 2 + house.depth}) `}>
          {house.rooms.map((r, i) => (
            <rect
              key={i}
              x={r.x}
              y={-(r.y + r.h)}
              width={r.w}
              height={r.h}
              fill={ROOM_STYLE[r.kind].fill}
              stroke="#475569"
              strokeWidth={s * 0.012}
            />
          ))}
        </g>
      </svg>
    </span>
  );
}
