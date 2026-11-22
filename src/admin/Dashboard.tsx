import { Building2, CheckSquare, Inbox, ExternalLink, History, Images, Loader2, LogOut, Plus, Search, Square, Tag, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BrandMark, StatusBadge, StatusDot } from '../components/ui';
import { STATUS } from '../config';
import { applyOverrides, loadOverrides } from '../lib/data';
import { cx, m2, num, price } from '../lib/format';
import type { LotStatus, Project } from '../types';
import { MapView, type MapHandle } from '../viewer/MapView';
import { adminApi, ApiError, type AdminProjectCard, type AuditItem, type LotChange } from './api';
import { LeadsView } from './LeadsView';
import { NewProjectWizard, ProjectEditor } from './ProjectAdmin';
import { GalleryManager } from './GalleryManager';

const STATUSES: LotStatus[] = ['available', 'reserved', 'sold'];

function parsePrice(v: string): number | null {
  const digits = v.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

export function Dashboard({ email, onLogout }: { email?: string; onLogout: () => void }) {
  const [cards, setCards] = useState<AdminProjectCard[]>([]);
  const [wizard, setWizard] = useState(false);
  const [view, setView] = useState<'projects' | 'leads'>('projects');
  const [newLeads, setNewLeads] = useState(0);
  useEffect(() => {
    const check = () =>
      adminApi.leadsCount().then(
        (r) => setNewLeads(r.new),
        () => {},
      );
    check();
    const t = window.setInterval(check, 60_000); // revisa cada minuto
    return () => window.clearInterval(t);
  }, []);
  const [slug, setSlug] = useState<string>('');
  const [project, setProject] = useState<Project | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<LotStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'lots' | 'gallery' | 'project' | 'audit'>('lots');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const mapRef = useRef<MapHandle>(null);

  const notify = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    window.setTimeout(() => setToast(null), 3500);
  };
  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return onLogout();
      notify(false, e instanceof Error ? e.message : 'Error');
    },
    [onLogout],
  );

  const loadList = useCallback(
    (select?: string) =>
      adminApi
        .projects()
        .then((r) => {
          setCards(r.projects);
          setSlug((s) => select || (r.projects.some((c) => c.slug === s) ? s : r.projects[0]?.slug || ''));
        })
        .catch(handleError),
    [handleError],
  );
  useEffect(() => {
    loadList();
  }, [loadList]);

  // Proyecto con los estados actuales del servidor (incluye proyectos ocultos)
  const reload = useCallback(
    async (s: string) => {
      try {
        const [raw, o] = await Promise.all([adminApi.project(s), loadOverrides()]);
        setProject(applyOverrides(raw, o[s]));
      } catch (e) {
        handleError(e);
      }
    },
    [handleError],
  );
  useEffect(() => {
    if (!slug) return;
    setProject(null);
    setSelected(new Set());
    reload(slug);
  }, [slug, reload]);

  const lots = project?.lots ?? [];
  const shown = useMemo(() => {
    const term = q
      .trim()
      .toLowerCase()
      .replace(/^lote\s*/, '');
    return lots.filter((l) => {
      if (filter !== 'all' && l.status !== filter) return false;
      if (!term) return true;
      const [a, b] = term.split(/[\s\-·,/]+/);
      if (b) return l.manzana.toLowerCase() === a && l.numero.toLowerCase() === b;
      return l.numero === a || l.manzana.toLowerCase() === a.replace(/^mz/, '');
    });
  }, [lots, filter, q]);
  const shownIds = useMemo(() => new Set(shown.map((l) => l.id)), [shown]);
  const single = selected.size === 1 ? lots.find((l) => selected.has(l.id)) : undefined;

  const toggle = (id: string, additive: boolean) =>
    setSelected((s) => {
      const n = new Set(additive ? s : []);
      if (s.has(id) && (additive || s.size === 1)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function save(changes: LotChange[], label: string) {
    if (!project || !changes.length) return;
    setBusy(true);
    try {
      await adminApi.saveLots(project.slug, changes);
      const o = Object.fromEntries(changes.map((c) => [c.lot, [c.status, c.price] as [LotStatus, number | null]]));
      setProject((p) => (p ? applyOverrides(p, o) : p));
      notify(true, label);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const setStatusFor = (status: LotStatus) =>
    save(
      lots.filter((l) => selected.has(l.id)).map((l) => ({ lot: l.id, status, price: l.price })),
      `${selected.size} ${selected.size === 1 ? 'lote marcado' : 'lotes marcados'} como ${STATUS[status].label.toLowerCase()}`,
    );
  const setPriceFor = (p: number | null) =>
    save(
      lots.filter((l) => selected.has(l.id)).map((l) => ({ lot: l.id, status: l.status, price: p })),
      `Precio actualizado en ${selected.size} ${selected.size === 1 ? 'lote' : 'lotes'}`,
    );

  async function logout(all = false) {
    try {
      await (all ? adminApi.logoutAll() : adminApi.logout());
    } finally {
      onLogout();
    }
  }

  const stats = project?.stats;

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-50">
      {/* Barra superior */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <BrandMark />
        <span className="bg-brand-50 text-brand-700 rounded-full px-2.5 py-1 text-xs font-bold">Panel</span>
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="focus:border-brand-500 h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none sm:max-w-xs"
          aria-label="Proyecto"
        >
          {cards.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
              {c.visible ? '' : ' (oculto)'}
            </option>
          ))}
        </select>
        <button
          onClick={() => setWizard(true)}
          className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-white"
          title="Crear un proyecto nuevo"
        >
          <Plus className="size-4" /> <span className="hidden sm:inline">Nuevo proyecto</span>
        </button>
        <button
          onClick={() => setView((v) => (v === 'leads' ? 'projects' : 'leads'))}
          className={cx(
            'relative inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold ring-1 transition',
            view === 'leads' ? 'bg-brand-50 text-brand-800 ring-brand-300' : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300',
          )}
          title="Solicitudes de quienes quieren publicar su proyecto"
        >
          <Inbox className="size-4" /> <span className="hidden sm:inline">{view === 'leads' ? 'Volver a proyectos' : 'Solicitudes'}</span>
          {newLeads > 0 && view !== 'leads' && (
            <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-extrabold text-white ring-2 ring-white">
              {newLeads}
            </span>
          )}
        </button>
        <div className="ml-auto flex items-center gap-1">
          {project && (
            <Link
              to={`/proyecto/${project.slug}`}
              target="_blank"
              className="hidden h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex"
            >
              <ExternalLink className="size-4" /> Ver en el sitio
            </Link>
          )}
          <span className="hidden px-2 text-xs text-slate-500 md:inline">{email}</span>
          <button
            onClick={() => logout()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            title="Cerrar sesión"
          >
            <LogOut className="size-4" /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {view === 'leads' ? (
        <LeadsView onError={handleError} notify={notify} onCount={setNewLeads} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Mapa */}
          <div className="relative h-[38vh] shrink-0 md:h-auto md:flex-1">
            {project ? (
              <MapView
                ref={mapRef}
                project={project}
                base="satellite"
                selectedId={single?.id ?? null}
                visibleIds={shownIds}
                houseFeatures={null}
                padding={{ top: 40, right: 40, bottom: 40, left: 40 }}
                onSelect={(id) => id && toggle(id, false)}
              />
            ) : (
              <div className="grid h-full place-items-center text-slate-400">
                <Loader2 className="size-6 animate-spin" />
              </div>
            )}
          </div>

          {/* Panel lateral */}
          <aside className="flex min-h-0 flex-1 flex-col border-l border-slate-200 bg-white md:w-[460px] md:flex-none">
            <div className="flex shrink-0 gap-5 border-b border-slate-100 px-4">
              {(
                [
                  ['lots', 'Lotes', Tag],
                  ['gallery', 'Galería', Images],
                  ['project', 'Proyecto', Building2],
                  ['audit', 'Actividad', History],
                ] as const
              ).map(([k, label, I]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cx(
                    'relative flex items-center gap-2 py-3 text-sm font-bold',
                    tab === k ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  <I className="size-4" /> {label}
                  {tab === k && <span className="bg-brand-600 absolute inset-x-0 -bottom-px h-0.5 rounded-full" />}
                </button>
              ))}
            </div>

            {tab === 'audit' ? (
              <AuditList onError={handleError} onLogoutAll={() => logout(true)} />
            ) : tab === 'project' ? (
              slug ? (
                <ProjectEditor
                  key={slug}
                  slug={slug}
                  onError={handleError}
                  notify={notify}
                  onChanged={() => {
                    loadList();
                    reload(slug);
                  }}
                  onDeleted={() => {
                    setTab('lots');
                    setSlug('');
                    loadList();
                  }}
                />
              ) : null
            ) : tab === 'gallery' ? (
              slug ? (
                <GalleryManager key={slug} project={slug} onError={handleError} notify={notify} />
              ) : null
            ) : (
              <>
                {/* Resumen y filtros */}
                <div className="shrink-0 space-y-3 border-b border-slate-100 p-4">
                  <div className="grid grid-cols-4 gap-2">
                    <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="Todos" value={stats?.total} />
                    {STATUSES.map((s) => (
                      <FilterChip
                        key={s}
                        active={filter === s}
                        onClick={() => setFilter(s)}
                        label={STATUS[s].label + 's'}
                        value={stats?.[s]}
                        color={STATUS[s].color}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                    <Search className="size-4 text-slate-400" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar: 3-4 (manzana-lote) o 3 (manzana)"
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                    {q && (
                      <button onClick={() => setQ('')} aria-label="Limpiar">
                        <X className="size-4 text-slate-400" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Tabla */}
                <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                      <tr>
                        <th className="w-10 py-2 pl-4">
                          <button
                            onClick={() =>
                              setSelected((s) => (shown.every((l) => s.has(l.id)) ? new Set() : new Set(shown.map((l) => l.id))))
                            }
                            aria-label="Seleccionar todos los visibles"
                          >
                            {shown.length > 0 && shown.every((l) => selected.has(l.id)) ? (
                              <CheckSquare className="text-brand-600 size-4" />
                            ) : (
                              <Square className="size-4" />
                            )}
                          </button>
                        </th>
                        <th className="py-2">Lote</th>
                        <th className="py-2">Área</th>
                        <th className="py-2">Estado</th>
                        <th className="py-2 pr-4 text-right">Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((l) => {
                        const on = selected.has(l.id);
                        return (
                          <tr
                            key={l.id}
                            onClick={(e) => {
                              toggle(l.id, e.ctrlKey || e.metaKey);
                              if (!(e.ctrlKey || e.metaKey)) mapRef.current?.flyToLot(l);
                            }}
                            className={cx('cursor-pointer border-b border-slate-100 transition', on ? 'bg-brand-50' : 'hover:bg-slate-50')}
                          >
                            <td className="py-2.5 pl-4" onClick={(e) => (e.stopPropagation(), toggle(l.id, true))}>
                              {on ? <CheckSquare className="text-brand-600 size-4" /> : <Square className="size-4 text-slate-400" />}
                            </td>
                            <td className="py-2.5 font-semibold text-slate-800">
                              Mz {l.manzana} · {l.numero}
                            </td>
                            <td className="py-2.5 text-slate-500 tabular-nums">{num(l.area)} m²</td>
                            <td className="py-2.5">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                <StatusDot status={l.status} /> {STATUS[l.status].label}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-right text-xs font-semibold text-slate-600 tabular-nums">
                              {price(l.price, project?.currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {project && shown.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No hay lotes con ese filtro.</p>}
                </div>

                {/* Acciones sobre la selección */}
                <AnimatePresence>
                  {selected.size > 0 && (
                    <motion.div
                      initial={{ y: 30, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 30, opacity: 0 }}
                      className="shrink-0 space-y-3 border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_-12px_rgb(2_44_34/0.25)]"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-extrabold text-slate-900">
                            {single ? `Lote ${single.numero} · Manzana ${single.manzana}` : `${selected.size} lotes seleccionados`}
                          </div>
                          {single && (
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                              {m2(single.area)} · <StatusBadge status={single.status} />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setSelected(new Set())}
                          className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
                          aria-label="Quitar selección"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {STATUSES.map((s) => (
                          <button
                            key={s}
                            disabled={busy}
                            onClick={() => setStatusFor(s)}
                            className={cx(
                              'flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold ring-1 transition disabled:opacity-50',
                              single?.status === s
                                ? 'text-white ring-transparent'
                                : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300',
                            )}
                            style={single?.status === s ? { background: STATUS[s].color } : undefined}
                          >
                            <StatusDot status={s} className={single?.status === s ? 'bg-white!' : ''} /> {STATUS[s].label}
                          </button>
                        ))}
                      </div>
                      <PriceEditor key={single?.id ?? 'multi'} initial={single?.price ?? null} busy={busy} onSave={setPriceFor} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </aside>
        </div>
      )}

      <NewProjectWizard
        open={wizard}
        onClose={() => setWizard(false)}
        existing={cards.map((c) => c.slug)}
        onCreated={(s) => {
          notify(true, 'Proyecto creado (oculto). Complétalo y publícalo en la pestaña Proyecto.');
          loadList(s);
          setTab('project');
        }}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={cx(
              'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl',
              toast.ok ? 'bg-brand-700' : 'bg-rose-600',
            )}
            role="status"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  value,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  value?: number;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'rounded-xl px-2 py-2 text-left ring-1 transition',
        active ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300',
      )}
    >
      <div className="flex items-center gap-1.5 text-lg font-extrabold text-slate-900">
        {color && <span className="size-2.5 rounded-full" style={{ background: color }} />}
        {value ?? '—'}
      </div>
      <div className="truncate text-[11px] font-semibold text-slate-500">{label}</div>
    </button>
  );
}

function PriceEditor({ initial, busy, onSave }: { initial: number | null; busy: boolean; onSave: (p: number | null) => void }) {
  const [v, setV] = useState(initial ? num(initial) : '');
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(parsePrice(v));
      }}
    >
      <div className="flex min-w-0 flex-1 items-center rounded-xl border border-slate-200 px-3">
        <span className="text-sm text-slate-400">$</span>
        <input
          value={v}
          onChange={(e) => {
            const p = parsePrice(e.target.value);
            setV(p == null ? '' : num(p));
          }}
          inputMode="numeric"
          placeholder="Precio (vacío = Consultar)"
          className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold outline-none"
        />
      </div>
      <button
        disabled={busy}
        className="bg-brand-600 hover:bg-brand-700 h-11 shrink-0 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        Guardar precio
      </button>
    </form>
  );
}

const ACTION: Record<string, string> = {
  project_create: 'Proyecto creado',
  project_edit: 'Datos de proyecto editados',
  project_plan: 'Plano reemplazado',
  project_show: 'Proyecto publicado',
  project_hide: 'Proyecto ocultado',
  project_delete: 'Proyecto eliminado',
  stepup_failed: 'Doble autorización fallida',
  lead_status: 'Solicitud actualizada',
  lead_delete: 'Solicitud eliminada',
  password_change: 'Contraseña cambiada',
  lots: 'Cambio de lotes',
  gallery_add: 'Foto o video agregado',
  gallery_update: 'Galería reordenada / editada',
  gallery_delete: 'Foto o video eliminado',
  login: 'Ingreso al panel',
  login_failed: 'Intento de ingreso fallido',
  setup: 'Cuenta creada',
  logout_all: 'Cierre de todas las sesiones',
};

function AuditList({ onError, onLogoutAll }: { onError: (e: unknown) => void; onLogoutAll: () => void }) {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  useEffect(() => {
    adminApi
      .audit()
      .then((r) => setItems(r.items))
      .catch(onError);
  }, [onError]);
  return (
    <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto p-4">
      <ul className="space-y-2">
        {items?.map((it, i) => {
          let detail = '';
          try {
            const d = JSON.parse(it.detail);
            if (Array.isArray(d))
              detail = d
                .map((c: LotChange) => `${c.lot} → ${STATUS[c.status]?.label ?? c.status}${c.price ? ` ($${num(c.price)})` : ''}`)
                .join(', ');
          } catch {
            /* sin detalle */
          }
          return (
            <li
              key={i}
              className={cx(
                'rounded-xl p-3 ring-1',
                it.action === 'login_failed' || it.action === 'stepup_failed' ? 'bg-rose-50 ring-rose-100' : 'bg-slate-50 ring-slate-100',
              )}
            >
              <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                {ACTION[it.action] ?? it.action}
                <span className="text-xs font-normal text-slate-500">{new Date(it.ts).toLocaleString('es-CO')}</span>
              </div>
              {detail && <p className="mt-1 text-xs text-slate-600">{detail}</p>}
              <p className="mt-0.5 text-[11px] text-slate-400">IP {it.ip}</p>
            </li>
          );
        })}
      </ul>
      {!items && <Loader2 className="mx-auto mt-8 size-5 animate-spin text-slate-400" />}
      <ChangePassword />
      <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-xs text-amber-900 ring-1 ring-amber-200">
        ¿Ves ingresos que no reconoces? Cierra todas las sesiones y cambia tu contraseña.
        <button onClick={onLogoutAll} className="mt-2 block font-bold text-amber-800 underline">
          Cerrar todas las sesiones
        </button>
      </div>
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get('next') !== f.get('next2')) return setMsg({ ok: false, text: 'Las contraseñas nuevas no coinciden' });
    setBusy(true);
    setMsg(null);
    try {
      await adminApi.changePassword(String(f.get('current')), String(f.get('code')).replace(/\s/g, ''), String(f.get('next')));
      form.reset();
      setMsg({ ok: true, text: 'Contraseña cambiada. Se cerraron las demás sesiones.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  }
  const cls = 'focus:border-brand-500 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none';
  return (
    <div className="mt-6 rounded-2xl p-4 ring-1 ring-slate-200">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-extrabold text-slate-900">
        Cambiar contraseña <span className="text-brand-700 text-xs font-bold">{open ? 'Cerrar' : 'Abrir'}</span>
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <input name="current" type="password" autoComplete="current-password" placeholder="Contraseña actual" required className={cls} />
          <input
            name="next"
            type="password"
            autoComplete="new-password"
            placeholder="Nueva contraseña (mín. 12, letras y números)"
            minLength={12}
            required
            className={cls}
          />
          <input
            name="next2"
            type="password"
            autoComplete="new-password"
            placeholder="Repite la nueva contraseña"
            minLength={12}
            required
            className={cls}
          />
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="Código de 6 dígitos"
            required
            className={cls}
          />
          {msg && <p className={cx('text-xs font-semibold', msg.ok ? 'text-brand-700' : 'text-rose-600')}>{msg.text}</p>}
          <button
            disabled={busy}
            className="bg-brand-600 hover:bg-brand-700 h-10 w-full rounded-lg text-sm font-bold text-white disabled:opacity-60"
          >
            Cambiar contraseña
          </button>
        </form>
      )}
    </div>
  );
}
