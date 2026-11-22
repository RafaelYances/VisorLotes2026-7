import { maplibregl } from '../lib/maplibre';
import { ArrowLeft, Compass, Expand, LocateFixed, Minus, Plus, Scan, Search, SlidersHorizontal, X } from 'lucide-react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { FullLoader } from '../components/Loader';
import { StatusDot } from '../components/ui';
import { STATUS } from '../config';
import { loadProject, useAsync } from '../lib/data';
import { cx } from '../lib/format';
import { lotBearing, rectToRing } from '../lib/geo';
import { fitHouse, HOUSES, ROOM_STYLE } from '../lib/houses';
import type { BaseLayer } from '../lib/mapStyle';
import type { LotStatus, Project } from '../types';
import { LotDetail } from '../viewer/LotDetail';
import { MapView, type MapHandle } from '../viewer/MapView';
import { ProjectOverview } from '../viewer/ProjectOverview';
import { NotFound } from './NotFound';

export default function ProjectPage() {
  const { slug = '' } = useParams();
  const { data: project, error, loading } = useAsync(() => loadProject(slug), [slug]);
  useEffect(() => {
    if (project) document.title = `${project.name} · Lotes del Caribe`;
  }, [project]);
  if (loading) return <FullLoader label="Preparando el mapa del proyecto…" />;
  if (error || !project) return <NotFound message="Este proyecto no existe o ya no está disponible." />;
  return <Viewer project={project} />;
}

function useIsDesktop() {
  const q = '(min-width: 768px)';
  const [v, setV] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setV(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return v;
}

function useFavorites(slug: string) {
  const key = `visorlotes:fav:${slug}`;
  const [fav, setFav] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  });
  const toggle = (id: string) =>
    setFav((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* sin almacenamiento */
      }
      return next;
    });
  return [fav, toggle] as const;
}

function Viewer({ project }: { project: Project }) {
  const desktop = useIsDesktop();
  const mapRef = useRef<MapHandle>(null);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('lote');
  const houseId = params.get('casa');
  const tab = (params.get('tab') as 'info' | 'casa') || (houseId ? 'casa' : 'info');
  const selected = project.lots.find((l) => l.id === selectedId) ?? null;

  const [base, setBase] = useState<BaseLayer>('satellite');
  const [statusFilter, setStatusFilter] = useState<Set<LotStatus>>(new Set(['available', 'reserved', 'sold']));
  const [mzFilter, setMzFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [houseOnMap, setHouseOnMap] = useState(true);
  const [bearing, setBearing] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fav, toggleFav] = useFavorites(project.slug);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) v == null ? n.delete(k) : n.set(k, v);
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const visible = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .replace(/^lote\s*/, '');
    return new Set(
      project.lots
        .filter((l) => statusFilter.has(l.status))
        .filter((l) => mzFilter === 'all' || l.manzana === mzFilter)
        .filter((l) => {
          if (!q) return true;
          const [a, b] = q.split(/[\s\-·,/]+/);
          if (b) return l.manzana.toLowerCase() === a && l.numero.toLowerCase() === b;
          return l.numero.toLowerCase() === a || `mz${l.manzana}`.toLowerCase() === a.replace(/\s/g, '');
        })
        .map((l) => l.id),
    );
  }, [project, statusFilter, mzFilter, query]);

  const sheetPeek = selected ? 0.5 : 0.3;
  const padding = desktop
    ? { top: 90, right: 460, bottom: 40, left: 40 }
    : { top: 120, right: 20, bottom: Math.round(window.innerHeight * (sheetOpen ? 0.86 : sheetPeek)) + 10, left: 20 };

  // Casa sobre el mapa
  const house = HOUSES.find((h) => h.id === houseId) ?? null;
  const houseFeatures = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!selected || tab !== 'casa') return null;
    const fit = fitHouse(selected, house ?? HOUSES[0], project.setbacks);
    const b = fit.buildable;
    const features: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        properties: { role: 'buildable', fill: '#fde68a' },
        geometry: { type: 'Polygon', coordinates: [rectToRing(project, selected, b.x, b.y, b.w, b.h)] },
      },
    ];
    if (house && houseOnMap) {
      for (const r of fit.house.rooms) {
        features.push({
          type: 'Feature',
          properties: { role: 'room', label: r.label, fill: ROOM_STYLE[r.kind].fill },
          geometry: { type: 'Polygon', coordinates: [rectToRing(project, selected, fit.x + r.x, fit.y + r.y, r.w, r.h)] },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [selected, house, houseOnMap, tab, project]);

  // Volar al lote al seleccionarlo
  const lastFly = useRef<string | null>(null);
  useEffect(() => {
    if (!selected) {
      lastFly.current = null;
      return;
    }
    const key = selected.id + (tab === 'casa' ? ':casa' : '');
    if (lastFly.current === key) return;
    const first = lastFly.current === null || !lastFly.current.startsWith(selected.id);
    const t = setTimeout(
      () => {
        lastFly.current = key;
        mapRef.current?.flyToLot(selected, tab === 'casa' ? { bearing: lotBearing(selected) } : undefined);
      },
      first ? 50 : 0,
    );
    return () => clearTimeout(t);
  }, [selected, tab]);

  const select = (id: string | null) => {
    if (id === selectedId) return;
    update({ lote: id, casa: null, tab: null });
    if (!desktop && id) setSheetOpen(false);
  };

  const nav = (dir: -1 | 1) => {
    if (!selected) return;
    const list = project.lots.filter((l) => visible.has(l.id));
    const arr = list.length ? list : project.lots;
    const i = arr.findIndex((l) => l.id === selected.id);
    const next = arr[(i + dir + arr.length) % arr.length];
    update({ lote: next.id });
  };

  // Teclado
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') update({ lote: null, casa: null, tab: null });
      if (selected && e.key === 'ArrowRight') nav(1);
      if (selected && e.key === 'ArrowLeft') nav(-1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // Ubicación del usuario
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        const ll: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        if (!userMarker.current) {
          const el = document.createElement('div');
          el.className = 'relative size-5';
          el.innerHTML =
            '<span class="absolute inset-0 animate-ping rounded-full bg-sky-400/60"></span><span class="absolute inset-0.5 rounded-full border-2 border-white bg-sky-500 shadow-lg"></span>';
          userMarker.current = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
        } else userMarker.current.setLngLat(ll);
        mapRef.current?.flyTo(ll[0], ll[1], 16);
      },
      () => alert('No pudimos obtener tu ubicación. Revisa los permisos del navegador.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const panel = selected ? (
    <LotDetail
      key="lot"
      project={project}
      lot={selected}
      tab={tab}
      onTab={(t) => update({ tab: t === 'info' ? null : t })}
      houseId={houseId}
      onHouse={(id) => {
        update({ casa: id, tab: 'casa' });
        if (id) setHouseOnMap(true);
      }}
      houseOnMap={houseOnMap}
      onHouseOnMap={setHouseOnMap}
      onClose={() => {
        update({ lote: null, casa: null, tab: null });
        mapRef.current?.fitProject();
      }}
      onNav={nav}
      isFav={fav.includes(selected.id)}
      onFav={() => toggleFav(selected.id)}
    />
  ) : (
    <ProjectOverview
      key="overview"
      project={project}
      visible={visible}
      favorites={fav}
      onSelect={(id) => select(id)}
      onPoi={(lng, lat) => {
        mapRef.current?.flyTo(lng, lat, 18);
        if (!desktop) setSheetOpen(false);
      }}
    />
  );

  const filtersActive = statusFilter.size < 3 || mzFilter !== 'all' || query !== '';

  return (
    <div className="bg-brand-950 fixed inset-0 overflow-hidden">
      <MapView
        ref={mapRef}
        project={project}
        base={base}
        selectedId={selectedId}
        visibleIds={visible}
        houseFeatures={houseFeatures}
        padding={padding}
        onSelect={select}
        onBearing={setBearing}
      />

      {/* Barra superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3 md:right-[460px] md:p-4">
        <Link
          to="/"
          className="glass text-brand-900 shadow-soft pointer-events-auto grid size-12 shrink-0 place-items-center rounded-2xl transition hover:bg-white"
          aria-label="Volver a proyectos"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <div className="pointer-events-auto min-w-0 flex-1 md:max-w-sm lg:max-w-md xl:max-w-xl">
          <div className="glass shadow-soft flex h-12 items-center gap-2 rounded-2xl pr-1.5 pl-4">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Buscar lote (ej: ${project.lots[0]?.manzana ?? 1}-${project.lots[0]?.numero ?? 1})`}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-800 outline-none placeholder:text-slate-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && visible.size === 1) select([...visible][0]);
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="Limpiar"
              >
                <X className="size-4" />
              </button>
            )}
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={cx(
                'relative grid size-9 place-items-center rounded-xl transition',
                filtersOpen ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
              aria-label="Filtros"
            >
              <SlidersHorizontal className="size-4" />
              {filtersActive && !filtersOpen && (
                <span className="bg-brand-500 absolute top-1 right-1 size-2 rounded-full ring-2 ring-white" />
              )}
            </button>
          </div>

          <AnimatePresence>
            {filtersOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                className="glass shadow-soft mt-2 space-y-4 rounded-2xl p-4"
              >
                <div>
                  <div className="mb-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Estado</div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(STATUS) as LotStatus[]).map((k) => {
                      const on = statusFilter.has(k);
                      return (
                        <button
                          key={k}
                          onClick={() =>
                            setStatusFilter((s) => {
                              const n = new Set(s);
                              if (n.has(k)) n.delete(k);
                              else n.add(k);
                              return n.size ? n : s;
                            })
                          }
                          className={cx(
                            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition',
                            on
                              ? 'bg-white text-slate-800 shadow-sm ring-slate-200'
                              : 'bg-transparent text-slate-400 line-through ring-slate-200/60',
                          )}
                        >
                          <StatusDot status={k} className={on ? '' : 'opacity-40'} />
                          {STATUS[k].label}
                          <span className="text-xs text-slate-400">{project.stats[k]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Manzana</div>
                  <div className="flex scrollbar-thin gap-1.5 overflow-x-auto pb-1">
                    {['all', ...project.manzanas.map((m) => m.name).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))].map(
                      (mz) => (
                        <button
                          key={mz}
                          onClick={() => setMzFilter(mz)}
                          className={cx(
                            'h-8 shrink-0 rounded-lg px-3 text-sm font-semibold transition',
                            mzFilter === mz
                              ? 'bg-brand-600 text-white'
                              : 'hover:ring-brand-300 bg-white text-slate-600 ring-1 ring-slate-200',
                          )}
                        >
                          {mz === 'all' ? 'Todas' : mz}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                {filtersActive && (
                  <button
                    onClick={() => {
                      setStatusFilter(new Set(['available', 'reserved', 'sold']));
                      setMzFilter('all');
                      setQuery('');
                    }}
                    className="text-brand-700 text-sm font-semibold hover:underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Controles del mapa */}
      <div
        className={cx(
          'absolute z-20 flex flex-col items-end gap-2 transition-all duration-300',
          desktop ? 'top-4 right-[476px]' : 'top-20 right-3',
        )}
      >
        <div className="glass shadow-soft flex rounded-2xl p-1 md:flex-row">
          {(['satellite', 'streets'] as BaseLayer[]).map((b) => (
            <button
              key={b}
              onClick={() => setBase(b)}
              className={cx(
                'relative rounded-xl px-3 py-2 text-xs font-bold transition',
                base === b ? 'text-white' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {base === b && (
                <motion.span
                  layoutId="base-pill"
                  className="bg-brand-600 absolute inset-0 rounded-xl"
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                />
              )}
              <span className="relative">{b === 'satellite' ? 'Satélite' : 'Mapa'}</span>
            </button>
          ))}
        </div>
        <div className="glass shadow-soft hidden flex-col overflow-hidden rounded-2xl md:flex">
          <Ctrl label="Acercar" onClick={() => mapRef.current?.zoomIn()}>
            <Plus className="size-5" />
          </Ctrl>
          <Ctrl label="Alejar" onClick={() => mapRef.current?.zoomOut()}>
            <Minus className="size-5" />
          </Ctrl>
        </div>
        <div className="glass shadow-soft flex flex-col overflow-hidden rounded-2xl">
          <Ctrl label="Orientar al norte" onClick={() => mapRef.current?.resetNorth()}>
            <Compass className="size-5 transition-transform" style={{ transform: `rotate(${-bearing - 45}deg)` }} />
          </Ctrl>
          <Ctrl label="Ver todo el proyecto" onClick={() => mapRef.current?.fitProject()}>
            <Scan className="size-5" />
          </Ctrl>
          <Ctrl label="Mi ubicación" onClick={locate}>
            <LocateFixed className="size-5" />
          </Ctrl>
          {desktop && (
            <Ctrl label="Pantalla completa" onClick={fullscreen}>
              <Expand className="size-5" />
            </Ctrl>
          )}
        </div>
      </div>

      {/* Leyenda (escritorio) */}
      {desktop && (
        <div
          className="glass shadow-soft absolute bottom-10 left-4 z-10 flex items-center gap-4 rounded-2xl px-4 py-2.5 text-xs font-semibold text-slate-700"
          style={{ marginBottom: 28 }}
        >
          {(Object.keys(STATUS) as LotStatus[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <StatusDot status={k} />
              {STATUS[k].label}
            </span>
          ))}
        </div>
      )}

      {/* Panel */}
      {desktop ? (
        <aside className="absolute top-4 right-4 bottom-4 z-30 w-[440px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-black/5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selected ? 'lot' : 'overview'}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="h-full"
            >
              {panel}
            </motion.div>
          </AnimatePresence>
        </aside>
      ) : (
        <BottomSheet
          open={sheetOpen}
          onOpen={setSheetOpen}
          peek={sheetPeek}
          title={selected ? `Lote ${selected.numero} · Mz ${selected.manzana}` : project.name}
        >
          {panel}
        </BottomSheet>
      )}
    </div>
  );
}

function Ctrl({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="hover:text-brand-700 grid size-11 place-items-center text-slate-700 transition hover:bg-white active:scale-95"
    >
      {children}
    </button>
  );
}

function BottomSheet({
  open,
  onOpen,
  peek,
  title,
  children,
}: {
  open: boolean;
  onOpen: (v: boolean) => void;
  peek: number;
  title: string;
  children: React.ReactNode;
}) {
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  const sheetH = h * 0.88;
  const closedY = sheetH - h * peek;
  return (
    <motion.div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-[0_-10px_40px_-10px_rgba(2,44,34,0.35)]"
      style={{ height: sheetH }}
      initial={{ y: sheetH }}
      animate={{ y: open ? 0 : closedY }}
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
    >
      <motion.button
        onClick={() => onOpen(!open)}
        onPanEnd={(_, info: PanInfo) => {
          if (info.offset.y < -30 && !open) onOpen(true);
          else if (info.offset.y > 30 && open) onOpen(false);
        }}
        className="flex w-full shrink-0 touch-none flex-col items-center pt-2.5 pb-2"
        aria-label={open ? `Contraer panel: ${title}` : `Expandir panel: ${title}`}
      >
        <span className="h-1.5 w-11 rounded-full bg-slate-300" />
      </motion.button>
      <div className="min-h-0 flex-1">{children}</div>
    </motion.div>
  );
}
