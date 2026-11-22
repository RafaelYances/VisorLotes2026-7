import { KeyRound, Loader2, LogOut, Search, ShieldCheck, Smartphone, Undo2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../admin/api';
import { AuthShell, Field, SubmitButton } from '../admin/AuthScreens';
import { FullLoader } from '../components/Loader';
import { BrandMark, StatusDot } from '../components/ui';
import { STATUS } from '../config';
import { cx, m2 } from '../lib/format';
import type { LotStatus, Project } from '../types';
import { MapView, type MapHandle } from '../viewer/MapView';
import { ownerApi } from './api';

const STATUSES: LotStatus[] = ['available', 'reserved', 'sold'];
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor');
const ErrorBox = ({ msg }: { msg: string }) =>
  msg ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{msg}</p> : null;

/** Portal del dueño del proyecto (/dueno). */
export default function OwnerApp() {
  const isInvite = window.location.pathname.replace(/\/+$/, '').endsWith('/invitacion');
  const [session, setSession] = useState<{ authenticated: boolean; email?: string; name?: string } | null>(null);
  const refresh = useCallback(() => {
    ownerApi.session().then(setSession, () => setSession({ authenticated: false }));
  }, []);

  useEffect(() => {
    document.title = 'Portal de dueños · Lotes del Caribe';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    refresh();
    return () => meta.remove();
  }, [refresh]);

  if (!session) return <FullLoader label="Verificando acceso…" />;
  if (isInvite)
    return (
      <Invite
        onDone={() => {
          window.history.replaceState(null, '', `${import.meta.env.BASE_URL}dueno`);
          refresh();
        }}
      />
    );
  if (!session.authenticated) return <Login onDone={refresh} />;
  return <OwnerDashboard name={session.name} onLogout={() => setSession({ authenticated: false })} />;
}

// ------------------------------------------------------------------ invitación

function Invite({ onDone }: { onDone: () => void }) {
  // El token viaja en el "#" del enlace: nunca se envía en las direcciones que ven otros servidores
  const [token] = useState(() => window.location.hash.slice(1));
  const [info, setInfo] = useState<{ project: string } | null>(null);
  const [fatal, setFatal] = useState('');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname); // quita el token de la barra de direcciones
    if (!token) return setFatal('Este enlace está incompleto. Ábrelo tal como te llegó.');
    ownerApi
      .checkInvite(token)
      .then(setInfo)
      .catch((e) => setFatal(errMsg(e)));
  }, [token]);

  useEffect(() => {
    if (mode !== 'new' || !info || setup) return;
    ownerApi
      .startInvite(token)
      .then(async (r) =>
        setSetup({
          secret: r.secret,
          qr: await QRCode.toDataURL(r.otpauth, { margin: 1, width: 220, color: { dark: '#022c22', light: '#ffffff' } }),
        }),
      )
      .catch((e) => setError(errMsg(e)));
  }, [mode, info, setup, token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (mode === 'new' && f.get('password') !== f.get('password2')) return setError('Las contraseñas no coinciden');
    setBusy(true);
    setError('');
    try {
      await ownerApi.acceptInvite({
        token,
        mode,
        name: String(f.get('name') ?? ''),
        email: String(f.get('email')),
        password: String(f.get('password')),
        secret: setup?.secret,
        code: String(f.get('code')).replace(/\s/g, ''),
      });
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  if (fatal)
    return (
      <AuthShell title="Enlace no válido" subtitle={fatal}>
        <a href={`${import.meta.env.BASE_URL}dueno`} className="text-brand-700 text-sm font-bold hover:underline">
          Ir al ingreso de dueños
        </a>
      </AuthShell>
    );
  if (!info) return <FullLoader label="Verificando invitación…" />;

  const codeField = (
    <Field
      label="Código de 6 dígitos"
      name="code"
      inputMode="numeric"
      pattern="[0-9 ]{6,7}"
      autoComplete="one-time-code"
      maxLength={7}
      required
      className="text-center text-xl font-bold tracking-[0.4em]"
    />
  );

  return (
    <AuthShell
      title={`Acceso a ${info.project}`}
      subtitle="Desde aquí podrás actualizar el estado de los lotes de tu proyecto: disponible, reservado o vendido."
    >
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ['new', 'Crear mi cuenta'],
            ['existing', 'Ya tengo cuenta'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setMode(k);
              setError('');
            }}
            className={cx('rounded-lg py-2 text-sm font-bold transition', mode === k ? 'bg-white text-slate-900 shadow' : 'text-slate-500')}
          >
            {l}
          </button>
        ))}
      </div>
      <form key={mode} onSubmit={submit} className="space-y-4">
        {mode === 'new' ? (
          <>
            <Field label="Tu nombre" name="name" autoComplete="name" required maxLength={80} autoFocus />
            <Field label="Tu correo" name="email" type="email" autoComplete="email" required />
            <Field
              label="Contraseña"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              hint="Mínimo 10 caracteres, con letras y números."
            />
            <Field label="Repite la contraseña" name="password2" type="password" autoComplete="new-password" minLength={10} required />
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Smartphone className="text-brand-600 size-4" /> Protección con tu celular
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-600">
                <li>
                  Instala <b>Google Authenticator</b> en tu celular (gratis).
                </li>
                <li>
                  Toca <b>+</b> → <b>Escanear código QR</b> y escanea este código.
                </li>
                <li>Escribe abajo el código de 6 dígitos que aparece.</li>
              </ol>
              <div className="mt-3 flex flex-col items-center gap-2">
                {setup ? (
                  <img src={setup.qr} alt="Código QR" className="size-44 rounded-xl ring-1 ring-slate-200" />
                ) : (
                  <Loader2 className="size-6 animate-spin text-slate-400" />
                )}
                {setup && (
                  <details className="text-center text-xs text-slate-500">
                    <summary className="cursor-pointer">¿Estás en el celular? Usa la clave manual</summary>
                    <code className="mt-1 block font-mono text-[13px] font-semibold break-all text-slate-800 select-all">
                      {setup.secret.match(/.{1,4}/g)?.join(' ')}
                    </code>
                  </details>
                )}
              </div>
            </div>
            {codeField}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">Ingresa con tu cuenta de dueño para agregar este proyecto a tu acceso.</p>
            <Field label="Tu correo" name="email" type="email" autoComplete="email" required autoFocus />
            <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
            {codeField}
          </>
        )}
        <ErrorBox msg={error} />
        <SubmitButton busy={busy}>
          <ShieldCheck className="size-5" /> {mode === 'new' ? 'Crear mi acceso' : 'Agregar proyecto'}
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

// ------------------------------------------------------------------ ingreso

function Login({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await ownerApi.login(String(f.get('email')), String(f.get('password')), String(f.get('code')).replace(/\s/g, ''));
      onDone();
    } catch (err) {
      setError(errMsg(err));
      form.querySelector<HTMLInputElement>('input[name=code]')!.value = '';
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell title="Portal de dueños" subtitle="Actualiza el estado de los lotes de tu proyecto.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Correo" name="email" type="email" autoComplete="email" required autoFocus />
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
        <Field
          label="Código de 6 dígitos"
          name="code"
          inputMode="numeric"
          pattern="[0-9 ]{6,7}"
          autoComplete="one-time-code"
          maxLength={7}
          required
          className="text-center text-xl font-bold tracking-[0.4em]"
          hint="Ábrelo en Google Authenticator."
        />
        <ErrorBox msg={error} />
        <SubmitButton busy={busy}>Ingresar</SubmitButton>
        <p className="text-center text-xs text-slate-500">¿Perdiste el acceso o tu celular? Pide un enlace nuevo al administrador.</p>
      </form>
    </AuthShell>
  );
}

// ------------------------------------------------------------------ panel del dueño

function OwnerDashboard({ name, onLogout }: { name?: string; onLogout: () => void }) {
  const [projects, setProjects] = useState<{ slug: string; name: string }[]>([]);
  const [slug, setSlug] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [filter, setFilter] = useState<LotStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [busyLot, setBusyLot] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean; undo?: () => void } | null>(null);
  const [showPass, setShowPass] = useState(false);
  const mapRef = useRef<MapHandle>(null);
  const toastTimer = useRef(0);

  const notify = (t: { msg: string; ok: boolean; undo?: () => void }) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  };
  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return onLogout();
      notify({ ok: false, msg: errMsg(e) });
    },
    [onLogout],
  );

  useEffect(() => {
    ownerApi
      .projects()
      .then((r) => {
        setProjects(r.projects);
        setSlug(r.projects[0]?.slug ?? '');
      })
      .catch(handle);
  }, [handle]);

  useEffect(() => {
    if (!slug) return;
    setProject(null);
    ownerApi.project(slug).then(setProject).catch(handle);
  }, [slug, handle]);

  const lots = useMemo(() => project?.lots ?? [], [project]);
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;
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
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, lots.filter((l) => l.status === s).length])), [lots]);

  async function change(lotId: string, status: LotStatus, silent = false) {
    // Siempre el estado más reciente (Deshacer se ejecuta después de otros cambios)
    const project = projectRef.current;
    const lot = project?.lots.find((l) => l.id === lotId);
    if (!project || !lot || lot.status === status) return;
    const prev = lot.status;
    setBusyLot(lotId);
    try {
      await ownerApi.setStatus(project.slug, [{ lot: lotId, status }]);
      setProject((p) => (p ? { ...p, lots: p.lots.map((l) => (l.id === lotId ? { ...l, status } : l)) } : p));
      if (!silent)
        notify({
          ok: true,
          msg: `Lote ${lot.numero} · Mz ${lot.manzana} → ${STATUS[status].label}`,
          undo: () => {
            setToast(null);
            change(lotId, prev, true);
          },
        });
      else notify({ ok: true, msg: 'Cambio deshecho' });
    } catch (e) {
      handle(e);
    } finally {
      setBusyLot(null);
    }
  }

  async function logout() {
    try {
      await ownerApi.logout();
    } finally {
      onLogout();
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-50">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <BrandMark />
        <div className="ml-auto flex items-center gap-1">
          <span className="hidden text-xs text-slate-500 sm:inline">{name}</span>
          <button
            onClick={() => setShowPass((v) => !v)}
            className="grid size-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100"
            title="Cambiar contraseña"
          >
            <KeyRound className="size-4" />
          </button>
          <button
            onClick={logout}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="size-4" /> Salir
          </button>
        </div>
      </header>

      {showPass && <ChangePassword onClose={() => setShowPass(false)} onError={handle} />}

      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          {projects.length > 1 ? (
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-bold"
            >
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-slate-900">{project?.name ?? projects[0]?.name ?? ''}</h1>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Toca el estado de un lote para cambiarlo. Se guarda al instante y se ve de inmediato en el sitio.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[34vh] shrink-0 lg:h-auto lg:flex-1">
          {project ? (
            <MapView
              ref={mapRef}
              project={project}
              base="satellite"
              selectedId={focus}
              visibleIds={new Set(shown.map((l) => l.id))}
              houseFeatures={null}
              padding={{ top: 30, right: 30, bottom: 30, left: 30 }}
              onSelect={(id) => {
                if (!id) return;
                setFocus(id);
                document.getElementById(`lot-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Loader2 className="size-6 animate-spin text-slate-400" />
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-white lg:w-[480px] lg:flex-none lg:border-l lg:border-slate-200">
          <div className="shrink-0 space-y-3 border-b border-slate-100 p-4">
            <div className="grid grid-cols-4 gap-2">
              {(['all', ...STATUSES] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={cx(
                    'rounded-xl px-2 py-2 text-left ring-1 transition',
                    filter === k ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200',
                  )}
                >
                  <div className="flex items-center gap-1.5 text-lg font-extrabold text-slate-900">
                    {k !== 'all' && <StatusDot status={k} />}
                    {k === 'all' ? lots.length : counts[k]}
                  </div>
                  <div className="truncate text-[11px] font-semibold text-slate-500">{k === 'all' ? 'Todos' : STATUS[k].label + 's'}</div>
                </button>
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

          <ul className="min-h-0 flex-1 scrollbar-thin divide-y divide-slate-100 overflow-y-auto">
            {shown.map((l) => (
              <li
                key={l.id}
                id={`lot-${l.id}`}
                className={cx('flex items-center gap-3 px-4 py-3 transition', focus === l.id && 'bg-brand-50')}
                onClick={() => {
                  setFocus(l.id);
                  mapRef.current?.flyToLot(l);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">
                    Lote {l.numero} · Mz {l.manzana}
                  </div>
                  <div className="text-xs text-slate-500">{m2(l.area)}</div>
                </div>
                <div className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1" onClick={(e) => e.stopPropagation()}>
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      disabled={busyLot === l.id}
                      onClick={() => change(l.id, s)}
                      className={cx(
                        'h-9 rounded-lg px-2.5 text-xs font-bold transition disabled:opacity-60 sm:px-3',
                        l.status === s ? 'text-white shadow' : 'text-slate-600 hover:bg-white',
                      )}
                      style={l.status === s ? { background: STATUS[s].color } : undefined}
                      aria-pressed={l.status === s}
                    >
                      {STATUS[s].label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
            {project && shown.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No hay lotes con ese filtro.</li>}
          </ul>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={cx(
              'fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-2xl',
              toast.ok ? 'bg-brand-800' : 'bg-rose-600',
            )}
            role="status"
          >
            {toast.msg}
            {toast.undo && (
              <button
                onClick={toast.undo}
                className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs font-bold hover:bg-white/25"
              >
                <Undo2 className="size-3.5" /> Deshacer
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChangePassword({ onClose, onError }: { onClose: () => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get('next') !== f.get('next2')) return setMsg('Las contraseñas nuevas no coinciden');
    setBusy(true);
    setMsg('');
    try {
      await ownerApi.changePassword(String(f.get('current')), String(f.get('code')).replace(/\s/g, ''), String(f.get('next')));
      form.reset();
      setMsg('✔ Contraseña cambiada');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && /Sesión/.test(err.message)) return onError(err);
      setMsg(errMsg(err));
    } finally {
      setBusy(false);
    }
  }
  const cls = 'focus:border-brand-500 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none';
  return (
    <form onSubmit={submit} className="grid shrink-0 gap-2 border-b border-slate-200 bg-white p-4 sm:grid-cols-5">
      <input name="current" type="password" autoComplete="current-password" placeholder="Contraseña actual" required className={cls} />
      <input
        name="next"
        type="password"
        autoComplete="new-password"
        placeholder="Nueva (mín. 10)"
        minLength={10}
        required
        className={cls}
      />
      <input
        name="next2"
        type="password"
        autoComplete="new-password"
        placeholder="Repite la nueva"
        minLength={10}
        required
        className={cls}
      />
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="Código 6 dígitos"
        required
        className={cls}
      />
      <div className="flex gap-2">
        <button disabled={busy} className="bg-brand-600 h-10 flex-1 rounded-lg text-sm font-bold text-white disabled:opacity-60">
          Cambiar
        </button>
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg bg-slate-100" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      {msg && <p className="text-xs font-semibold text-slate-700 sm:col-span-5">{msg}</p>}
    </form>
  );
}
