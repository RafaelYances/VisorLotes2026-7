import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Home, Info, Navigation, Share2, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { StatusBadge, WhatsAppIcon } from '../components/ui';
import { cx, m, m2, price, whatsappUrl } from '../lib/format';
import { track } from '../lib/track';
import { HOUSES } from '../lib/houses';
import type { Lot, Project } from '../types';
import { HouseDesigner } from './HouseDesigner';
import { LotPlan } from './LotPlan';

interface Props {
  project: Project;
  lot: Lot;
  tab: 'info' | 'casa';
  onTab: (t: 'info' | 'casa') => void;
  houseId: string | null;
  onHouse: (id: string | null) => void;
  houseOnMap: boolean;
  onHouseOnMap: (v: boolean) => void;
  onClose: () => void;
  onNav: (dir: -1 | 1) => void;
  isFav: boolean;
  onFav: () => void;
}

const ROLE: Record<string, string> = { frente: 'Frente', fondo: 'Fondo', izquierdo: 'Lateral izq.', derecho: 'Lateral der.' };

export function LotDetail(p: Props) {
  const { project, lot, tab } = p;
  const [copied, setCopied] = useState(false);
  const house = HOUSES.find((h) => h.id === p.houseId);
  const msg =
    `Hola, me interesa el *Lote ${lot.numero} de la Manzana ${lot.manzana}* en ${project.name} (${m2(lot.area)}).` +
    (house ? ` Me gustaría construir algo como el diseño "${house.name}".` : '') +
    `\n${location.href}`;

  async function share() {
    track(project.slug, 'share', lot.id);
    const url = location.href;
    const data = { title: `${project.name} · Lote ${lot.numero} Mz ${lot.manzana}`, text: `Mira este lote de ${m2(lot.area)}`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* cancelado */
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Encabezado */}
      <div className="from-brand-800 via-brand-700 to-brand-600 relative shrink-0 overflow-hidden bg-gradient-to-br px-5 pt-4 pb-5 text-white">
        <div className="bg-brand-300/30 absolute -top-10 -right-10 size-40 rounded-full blur-2xl" />
        <div className="relative flex items-center justify-between">
          <button
            onClick={p.onClose}
            className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="size-4" /> Proyecto
          </button>
          <div className="flex items-center gap-1">
            <IconBtn label="Lote anterior" onClick={() => p.onNav(-1)}>
              <ChevronLeft className="size-4" />
            </IconBtn>
            <IconBtn label="Lote siguiente" onClick={() => p.onNav(1)}>
              <ChevronRight className="size-4" />
            </IconBtn>
            <IconBtn label={p.isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'} onClick={p.onFav}>
              <Heart className={cx('size-4 transition', p.isFav && 'fill-rose-400 text-rose-400')} />
            </IconBtn>
            <IconBtn label="Compartir" onClick={share}>
              {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
            </IconBtn>
          </div>
        </div>
        <div className="relative mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-brand-200 text-xs font-bold tracking-[0.18em] uppercase">Manzana {lot.manzana}</p>
            <h2 className="text-3xl font-extrabold tracking-tight">Lote {lot.numero}</h2>
          </div>
          <div className="rounded-full bg-white p-0.5">
            <StatusBadge status={lot.status} />
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <HeadKpi label="Área" value={m2(lot.area)} />
          <HeadKpi label="Frente" value={m(lot.frente)} />
          <HeadKpi label="Fondo" value={m(lot.fondo)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 shrink-0 border-b border-slate-100 bg-white/95 px-5 backdrop-blur">
        <div className="relative flex gap-6">
          {(
            [
              ['info', 'Detalles', Info],
              ['casa', 'Diseña tu casa', Home],
            ] as const
          ).map(([k, label, I]) => (
            <button
              key={k}
              onClick={() => p.onTab(k)}
              className={cx(
                'relative flex items-center gap-2 py-3.5 text-sm font-bold transition',
                tab === k ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <I className="size-4" /> {label}
              {k === 'casa' && <span className="bg-brand-100 text-brand-700 rounded-full px-1.5 text-[10px] font-extrabold">NUEVO</span>}
              {tab === k && (
                <motion.span layoutId="tab-underline" className="bg-brand-600 absolute inset-x-0 -bottom-px h-0.5 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-5 py-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab + lot.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            {tab === 'info' ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Precio</div>
                    <div className="text-brand-950 text-xl font-extrabold">{price(lot.price, project.currency)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Perímetro</div>
                    <div className="text-base font-bold text-slate-800">{m(lot.perimeter)}</div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-slate-50 to-white ring-1 ring-slate-200/70">
                  <LotPlan lot={lot} className="h-80 w-full" />
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">Linderos y medidas</h3>
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                    {lot.sides.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 bg-white px-4 py-2.5 text-sm">
                        <span className="font-semibold text-slate-700">{ROLE[s.role]}</span>
                        <span className="flex-1 truncate text-right text-slate-500">{s.colinda}</span>
                        <span className="text-brand-800 w-20 text-right font-bold tabular-nums">{m(s.length)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => p.onTab('casa')}
                  className="group from-brand-950 to-brand-800 shadow-soft flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-r p-4 text-left text-white"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 transition group-hover:scale-110">
                    <Home className="text-brand-300 size-6" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-bold">¿Qué casa puedo construir aquí?</span>
                    <span className="text-brand-100/70 block text-sm">Prueba {HOUSES.length} diseños a escala real en este lote</span>
                  </span>
                  <ChevronRight className="size-5 transition group-hover:translate-x-1" />
                </button>
              </div>
            ) : (
              <HouseDesigner
                project={project}
                lot={lot}
                houseId={p.houseId}
                onHouse={p.onHouse}
                onMap={p.houseOnMap}
                onToggleMap={p.onHouseOnMap}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Acciones */}
      <div className="shrink-0 border-t border-slate-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <a
            href={whatsappUrl(project.contact.whatsapp, msg)}
            onClick={() => track(project.slug, 'wa', lot.id)}
            target="_blank"
            rel="noopener"
            className={cx(
              'shadow-glow inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl font-bold text-white transition active:scale-[0.98]',
              lot.status === 'sold' ? 'bg-slate-700 hover:bg-slate-800' : 'bg-brand-600 hover:bg-brand-700',
            )}
          >
            <WhatsAppIcon className="size-5" />
            {lot.status === 'sold'
              ? 'Pedir lotes similares'
              : lot.status === 'reserved'
                ? 'Consultar disponibilidad'
                : 'Me interesa este lote'}
          </a>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${lot.center[1]},${lot.center[0]}`}
            target="_blank"
            rel="noopener"
            className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200"
            aria-label="Cómo llegar"
            title="Cómo llegar"
          >
            <Navigation className="size-5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-xl text-white/85 transition hover:bg-white/15 hover:text-white"
    >
      {children}
    </button>
  );
}

function HeadKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur">
      <div className="text-brand-100/80 text-[10px] font-bold tracking-wider uppercase">{label}</div>
      <div className="text-base font-extrabold tabular-nums">{value}</div>
    </div>
  );
}
