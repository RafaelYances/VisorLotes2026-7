import { Heart, Images, MapPin, Waves } from 'lucide-react';
import { useState } from 'react';
import { GalleryMosaic, Lightbox } from '../components/Gallery';
import { motion } from 'motion/react';
import { HighlightIcon, StatusDot, WhatsAppIcon } from '../components/ui';
import { STATUS } from '../config';
import { asset } from '../lib/data';
import { cx, ha, m2, num, whatsappUrl } from '../lib/format';
import type { Lot, LotStatus, Project } from '../types';

interface Props {
  project: Project;
  visible: Set<string>;
  favorites: string[];
  onSelect: (id: string) => void;
  onPoi: (lng: number, lat: number) => void;
}

export function ProjectOverview({ project, visible, favorites, onSelect, onPoi }: Props) {
  const s = project.stats;
  const [shown, setShown] = useState<number | null>(null);
  const gallery = project.gallery ?? [];
  const byMz = new Map<string, Lot[]>();
  for (const l of project.lots) byMz.set(l.manzana, [...(byMz.get(l.manzana) ?? []), l]);
  const favLots = project.lots.filter((l) => favorites.includes(l.id));

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        {/* Portada */}
        <div className="from-brand-950 via-brand-900 to-brand-700 relative overflow-hidden bg-gradient-to-br px-5 pt-6 pb-6 text-white">
          <div className="bg-brand-400/25 absolute -top-12 -right-12 size-48 rounded-full blur-3xl" />
          {project.logo ? (
            <img src={asset(project.logo)} alt={project.name} className="relative h-16 w-auto drop-shadow-xl" />
          ) : (
            <h1 className="relative text-2xl font-extrabold">{project.name}</h1>
          )}
          <p className="text-brand-50/80 relative mt-3 text-sm leading-relaxed">{project.description}</p>
          <a
            href={project.location.mapsUrl ?? `https://www.google.com/maps?q=${project.location.lat},${project.location.lng}`}
            target="_blank"
            rel="noopener"
            className="text-brand-200 relative mt-3 inline-flex items-center gap-1.5 text-xs font-semibold hover:text-white"
          >
            <MapPin className="size-3.5" /> {project.location.city}, {project.location.region}
          </a>
        </div>

        <div className="space-y-6 p-5">
          {/* Galería */}
          {gallery.length > 0 && (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-500 uppercase">
                  <Images className="size-3.5" /> Galería
                </h3>
                <button onClick={() => setShown(0)} className="text-brand-700 text-xs font-semibold hover:underline">
                  Ver todo ({gallery.length})
                </button>
              </div>
              <GalleryMosaic items={gallery} onOpen={setShown} />
              <Lightbox items={gallery} index={shown} onClose={() => setShown(null)} onIndex={setShown} />
            </section>
          )}

          {/* Disponibilidad */}
          <section className="flex items-center gap-5">
            <Donut stats={s} />
            <div className="flex-1 space-y-2">
              {(['available', 'reserved', 'sold'] as LotStatus[]).map((k) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <StatusDot status={k} />
                    {STATUS[k].label}s
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums">{s[k]}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
                <span>{s.manzanas} manzanas</span>
                <span>{ha(s.areaTotal)} vendibles</span>
              </div>
            </div>
          </section>

          {/* Highlights */}
          {project.highlights.length > 0 && (
            <section className="grid grid-cols-2 gap-2.5">
              {project.highlights.map((h, i) => (
                <motion.div
                  key={h.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="bg-brand-50/70 ring-brand-100 rounded-2xl p-3.5 ring-1"
                >
                  <HighlightIcon name={h.icon} className="text-brand-600 size-5" />
                  <div className="text-brand-950 mt-2 text-sm leading-tight font-bold">{h.title}</div>
                  <div className="mt-0.5 text-xs leading-snug text-slate-600">{h.text}</div>
                </motion.div>
              ))}
            </section>
          )}

          {/* Salidas al mar */}
          {project.pois.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">Salidas al mar</h3>
              <div className="flex flex-wrap gap-2">
                {[...project.pois]
                  .sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99))
                  .map((p) => (
                    <button
                      key={p.name}
                      onClick={() => onPoi(p.lng, p.lat)}
                      className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200 transition hover:bg-sky-100"
                    >
                      <Waves className="size-3.5" /> {p.name}
                      {p.minutes && <span className="rounded-full bg-white px-1.5 text-[10px] text-sky-700">{p.minutes} min</span>}
                    </button>
                  ))}
              </div>
            </section>
          )}

          {/* Favoritos */}
          {favLots.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-500 uppercase">
                <Heart className="size-3.5 fill-rose-400 text-rose-400" /> Tus favoritos
              </h3>
              <div className="flex flex-wrap gap-2">
                {favLots.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onSelect(l.id)}
                    className="hover:ring-brand-400 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                  >
                    <StatusDot status={l.status} /> Lote {l.numero} · Mz {l.manzana}
                    <span className="text-slate-400">{m2(l.area)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Explorador de lotes */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase">Todos los lotes</h3>
              <span className="text-xs text-slate-400">{num(visible.size)} visibles</span>
            </div>
            <div className="space-y-3">
              {[...byMz.entries()].map(([mz, lots]) => (
                <div key={mz} className="rounded-2xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">Manzana {mz}</span>
                    <span className="text-slate-500">{lots.filter((l) => l.status === 'available').length} disponibles</span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {lots.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => onSelect(l.id)}
                        title={`Lote ${l.numero} · ${STATUS[l.status].label} · ${m2(l.area)}`}
                        className={cx(
                          'h-9 rounded-lg text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
                          !visible.has(l.id) && 'opacity-25',
                        )}
                        style={{ background: STATUS[l.status].color }}
                      >
                        {l.numero}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <a
          href={whatsappUrl(project.contact.whatsapp, `Hola, quiero información sobre los lotes de ${project.name}.`)}
          target="_blank"
          rel="noopener"
          className="bg-brand-600 shadow-glow hover:bg-brand-700 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-bold text-white transition active:scale-[0.98]"
        >
          <WhatsAppIcon className="size-5" /> Hablar con un asesor
        </a>
      </div>
    </div>
  );
}

function Donut({ stats }: { stats: Project['stats'] }) {
  const r = 38,
    c = 2 * Math.PI * r;
  const total = stats.total || 1;
  let acc = 0;
  const segs = (['available', 'reserved', 'sold'] as LotStatus[]).map((k) => {
    const len = (stats[k] / total) * c;
    const seg = { k, len, off: acc };
    acc += len;
    return seg;
  });
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx={50} cy={50} r={r} fill="none" stroke="#f1f5f9" strokeWidth={12} />
        {segs.map((s) => (
          <motion.circle
            key={s.k}
            cx={50}
            cy={50}
            r={r}
            fill="none"
            stroke={STATUS[s.k].color}
            strokeWidth={12}
            strokeDasharray={`${s.len} ${c}`}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: -s.off }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-brand-950 text-2xl leading-none font-extrabold">{stats.available}</div>
          <div className="mt-0.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">de {stats.total}</div>
        </div>
      </div>
    </div>
  );
}
