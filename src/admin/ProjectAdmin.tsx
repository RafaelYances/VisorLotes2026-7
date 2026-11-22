import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  FileUp,
  ImageUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SITE } from '../config';
import { asset } from '../lib/data';
import { cx, m2, num } from '../lib/format';
import type { Project, ProjectCard } from '../types';
import { MapView } from '../viewer/MapView';
import { adminApi, type ProjectMeta } from './api';
import { StepUpDialog, type StepUpRequest } from './StepUp';

const ICON_OPTIONS = [
  ['waves', 'Mar / playa'],
  ['road', 'Vías / acceso'],
  ['layers', 'Etapas / lotes'],
  ['palmtree', 'Naturaleza'],
  ['sun', 'Clima / sol'],
  ['pin', 'Ubicación'],
] as const;

const STATUS_OPTIONS = [
  ['en-venta', 'En venta'],
  ['proximamente', 'Próximamente'],
  ['vendido', 'Agotado'],
] as const;

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export function emptyMeta(): ProjectMeta {
  return {
    name: '',
    tagline: '',
    description: '',
    status: 'en-venta',
    location: { city: '', region: '', mapsUrl: '' },
    contact: { whatsapp: SITE.whatsapp, phoneLabel: '' },
    currency: 'COP',
    highlights: [],
    setbacks: { front: 3, back: 3, side: 1.5 },
    logo: null,
  };
}

export function metaFromProject(p: Project): ProjectMeta {
  return {
    name: p.name ?? '',
    tagline: p.tagline ?? '',
    description: p.description ?? '',
    status: p.status ?? 'en-venta',
    location: {
      city: p.location?.city ?? '',
      region: p.location?.region ?? '',
      lat: p.location?.lat ?? '',
      lng: p.location?.lng ?? '',
      mapsUrl: p.location?.mapsUrl ?? '',
    },
    contact: { whatsapp: p.contact?.whatsapp ?? '', phoneLabel: p.contact?.phoneLabel ?? '' },
    currency: p.currency ?? 'COP',
    highlights: p.highlights ?? [],
    setbacks: p.setbacks ?? { front: 3, back: 3, side: 1.5 },
    logo: p.logo ?? null,
  };
}

// ------------------------------------------------------------------ campos

const inputCls =
  'focus:border-brand-500 focus:ring-brand-500/15 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:ring-4';

function L({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-slate-50/70 p-4 ring-1 ring-slate-100">
      <h3 className="text-xs font-extrabold tracking-wider text-slate-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Reduce el logo (máx. 600 px) conservando la transparencia. */
async function prepareLogo(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error('Formato no compatible. Usa PNG, WebP o JPG.');
  });
  const r = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * r);
  c.height = Math.round(bmp.height * r);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const webp = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/webp', 0.9));
  if (webp?.type === 'image/webp') return webp;
  const png = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!png) throw new Error('No se pudo procesar el logo');
  return png;
}

export function ProjectForm({
  slug,
  meta,
  onChange,
  compact,
}: {
  slug: string;
  meta: ProjectMeta;
  onChange: (m: ProjectMeta) => void;
  compact?: boolean;
}) {
  const set = (patch: Partial<ProjectMeta>) => onChange({ ...meta, ...patch });
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState('');

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    setLogoErr('');
    try {
      const blob = await prepareLogo(file);
      const r = await adminApi.uploadLogo(slug, blob);
      set({ logo: r.src });
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Información">
        <L label="Nombre del proyecto *">
          <input className={inputCls} value={meta.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} required />
        </L>
        <L label="Frase corta" hint="Aparece en la tarjeta del inicio. Ej: Lotes campestres a pasos del mar">
          <input className={inputCls} value={meta.tagline} maxLength={140} onChange={(e) => set({ tagline: e.target.value })} />
        </L>
        <L label="Estado del proyecto">
          <select className={inputCls} value={meta.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </L>
        {!compact && (
          <L label="Descripción">
            <textarea
              className={cx(inputCls, 'h-28 resize-y py-2')}
              value={meta.description}
              maxLength={1200}
              onChange={(e) => set({ description: e.target.value })}
            />
          </L>
        )}
      </Section>

      <Section title="Ubicación">
        <div className="grid grid-cols-2 gap-3">
          <L label="Municipio">
            <input
              className={inputCls}
              value={meta.location.city}
              maxLength={80}
              onChange={(e) => set({ location: { ...meta.location, city: e.target.value } })}
            />
          </L>
          <L label="Departamento, país">
            <input
              className={inputCls}
              value={meta.location.region}
              maxLength={80}
              onChange={(e) => set({ location: { ...meta.location, region: e.target.value } })}
            />
          </L>
        </div>
        {!compact && (
          <>
            <L label="Enlace de Google Maps (opcional)" hint="Debe empezar por https://">
              <input
                className={inputCls}
                value={meta.location.mapsUrl ?? ''}
                maxLength={500}
                placeholder="https://maps.app.goo.gl/…"
                onChange={(e) => set({ location: { ...meta.location, mapsUrl: e.target.value } })}
              />
            </L>
            <div className="grid grid-cols-2 gap-3">
              <L label="Latitud (opcional)" hint="Si se deja vacío, se usa el centro del plano">
                <input
                  className={inputCls}
                  value={meta.location.lat ?? ''}
                  inputMode="decimal"
                  onChange={(e) => set({ location: { ...meta.location, lat: e.target.value } })}
                />
              </L>
              <L label="Longitud (opcional)">
                <input
                  className={inputCls}
                  value={meta.location.lng ?? ''}
                  inputMode="decimal"
                  onChange={(e) => set({ location: { ...meta.location, lng: e.target.value } })}
                />
              </L>
            </div>
          </>
        )}
      </Section>

      <Section title="Contacto">
        <div className="grid grid-cols-2 gap-3">
          <L label="WhatsApp" hint="Con indicativo, sin +. Ej: 573001234567">
            <input
              className={inputCls}
              value={meta.contact.whatsapp}
              inputMode="numeric"
              onChange={(e) => set({ contact: { ...meta.contact, whatsapp: e.target.value.replace(/\D/g, '') } })}
            />
          </L>
          <L label="Teléfono visible">
            <input
              className={inputCls}
              value={meta.contact.phoneLabel}
              maxLength={40}
              placeholder="+57 300 123 4567"
              onChange={(e) => set({ contact: { ...meta.contact, phoneLabel: e.target.value } })}
            />
          </L>
        </div>
        {!compact && (
          <L label="Moneda de los precios">
            <select className={inputCls} value={meta.currency} onChange={(e) => set({ currency: e.target.value })}>
              <option value="COP">Pesos colombianos (COP)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </L>
        )}
      </Section>

      {!compact && (
        <>
          <Section title="Logo del proyecto">
            <div className="flex items-center gap-4">
              <div className="from-brand-900 to-brand-700 grid h-20 w-36 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br p-2">
                {meta.logo ? (
                  <img src={asset(meta.logo)} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-white/60">Sin logo</span>
                )}
              </div>
              <div className="space-y-2">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-white px-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300">
                  {logoBusy ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} Subir logo
                  <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                  />
                </label>
                {meta.logo && (
                  <button
                    type="button"
                    onClick={() => set({ logo: null })}
                    className="block text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Quitar logo
                  </button>
                )}
                <p className="text-[11px] text-slate-500">PNG o WebP con fondo transparente. Se ve sobre fondo verde oscuro.</p>
                {logoErr && <p className="text-xs text-rose-600">{logoErr}</p>}
              </div>
            </div>
          </Section>

          <Section title="Destacados (máx. 6)">
            {meta.highlights.map((h, i) => (
              <div key={i} className="grid grid-cols-[130px_1fr_auto] items-start gap-2">
                <select
                  className={inputCls}
                  value={h.icon}
                  onChange={(e) => set({ highlights: meta.highlights.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })}
                >
                  {ICON_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <div className="space-y-1.5">
                  <input
                    className={inputCls}
                    value={h.title}
                    maxLength={60}
                    placeholder="Título (ej: 3 salidas al mar)"
                    onChange={(e) => set({ highlights: meta.highlights.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                  />
                  <input
                    className={inputCls}
                    value={h.text}
                    maxLength={140}
                    placeholder="Detalle (ej: la más cercana a 3 minutos)"
                    onChange={(e) => set({ highlights: meta.highlights.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => set({ highlights: meta.highlights.filter((_, j) => j !== i) })}
                  className="grid size-11 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Quitar"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {meta.highlights.length < 6 && (
              <button
                type="button"
                onClick={() => set({ highlights: [...meta.highlights, { icon: 'pin', title: '', text: '' }] })}
                className="text-brand-700 inline-flex items-center gap-1.5 text-sm font-bold hover:underline"
              >
                <Plus className="size-4" /> Agregar destacado
              </button>
            )}
          </Section>

          <Section title="Retiros para el diseñador de casas (metros)">
            <div className="grid grid-cols-3 gap-3">
              {(['front', 'back', 'side'] as const).map((k) => (
                <L key={k} label={{ front: 'Frente', back: 'Fondo', side: 'Laterales' }[k]}>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={meta.setbacks[k]}
                    onChange={(e) => set({ setbacks: { ...meta.setbacks, [k]: Number(e.target.value) } })}
                  />
                </L>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">Verifica la norma urbanística del municipio.</p>
          </Section>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ plano DXF

export interface PlanResult {
  plan: Pick<Project, 'location' | 'bounds' | 'stats' | 'affine' | 'lots' | 'manzanas' | 'roads' | 'greens' | 'labels' | 'pois'>;
  preview: ProjectCard['preview'];
  warnings: string[];
  fileName: string;
}

export function PlanUploader({
  name,
  onResult,
  result,
}: {
  name: string;
  onResult: (r: PlanResult | null) => void;
  result: PlanResult | null;
}) {
  const [zone, setZone] = useState(18);
  const [hemisphere, setHemisphere] = useState<'north' | 'south'>('north');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(f = file) {
    if (!f) return;
    setBusy(true);
    setError('');
    onResult(null);
    try {
      if (f.size > 25 * 1024 * 1024) throw new Error('El DXF pesa más de 25 MB. Deja en el archivo solo las capas del loteo.');
      const { processCad } = await import('../../shared/cad.js');
      const text = await f.text();
      const out = processCad(text, { zone, hemisphere });
      onResult({ ...out, fileName: f.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar el archivo');
    } finally {
      setBusy(false);
    }
  }

  const previewProject = useMemo<Project | null>(() => {
    if (!result) return null;
    return {
      slug: `preview-${result.fileName}-${result.plan.lots.length}-${result.plan.bounds.join()}`,
      name: name || 'Vista previa',
      tagline: '',
      description: '',
      status: 'en-venta',
      contact: { whatsapp: '', phoneLabel: '' },
      currency: 'COP',
      highlights: [],
      setbacks: { front: 3, back: 3, side: 1.5 },
      gallery: [],
      ...result.plan,
    } as Project;
  }, [result, name]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <L label="Zona UTM" hint="Colombia: 17, 18 o 19 (Córdoba/Sucre: 18)">
          <input className={inputCls} type="number" min={1} max={60} value={zone} onChange={(e) => setZone(Number(e.target.value))} />
        </L>
        <L label="Hemisferio">
          <select className={inputCls} value={hemisphere} onChange={(e) => setHemisphere(e.target.value as 'north' | 'south')}>
            <option value="north">Norte</option>
            <option value="south">Sur</option>
          </select>
        </L>
      </div>
      <label className="hover:border-brand-400 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center transition hover:bg-slate-50">
        {busy ? <Loader2 className="text-brand-600 size-8 animate-spin" /> : <FileUp className="text-brand-600 size-8" />}
        <span className="text-sm font-bold text-slate-800">{file ? file.name : 'Elige el plano en formato DXF'}</span>
        <span className="text-xs text-slate-500">
          Capas: <b>Lote &lt;manzana&gt; &lt;número&gt;</b>, <b>Mz.&lt;manzana&gt;</b>, <b>AREA VIAL</b>, <b>AREA VERDE</b>. Coordenadas en
          UTM.
        </span>
        <input
          type="file"
          accept=".dxf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f) run(f);
            e.target.value = '';
          }}
        />
      </label>
      {file && !busy && (
        <button type="button" onClick={() => run()} className="text-brand-700 text-xs font-bold hover:underline">
          Volver a procesar con la zona {zone} {hemisphere === 'north' ? 'Norte' : 'Sur'}
        </button>
      )}
      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}

      {result && previewProject && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ['Lotes', num(result.plan.stats.total)],
              ['Manzanas', num(result.plan.stats.manzanas)],
              ['Área mín.', m2(Math.round(result.plan.stats.areaMin))],
              ['Rótulos', num(result.plan.labels.length)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white px-2 py-2 ring-1 ring-slate-200">
                <div className="text-sm font-extrabold text-slate-900">{v}</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase">{k}</div>
              </div>
            ))}
          </div>
          {result.warnings.map((w) => (
            <p key={w} className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
            </p>
          ))}
          <div className="relative h-72 overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <MapView
              project={previewProject}
              base="satellite"
              selectedId={null}
              visibleIds={new Set(previewProject.lots.map((l) => l.id))}
              houseFeatures={null}
              padding={{ top: 20, right: 20, bottom: 20, left: 20 }}
              onSelect={() => {}}
            />
          </div>
          <p className="text-xs text-slate-500">
            Revisa que los lotes caigan en su sitio sobre el satélite. Si aparecen en otro lugar, cambia la zona UTM.
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pestaña "Proyecto"

export function ProjectEditor({
  slug,
  onChanged,
  onDeleted,
  onError,
  notify,
}: {
  slug: string;
  onChanged: () => void;
  onDeleted: () => void;
  onError: (e: unknown) => void;
  notify: (ok: boolean, msg: string) => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.project>> | null>(null);
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stepUp, setStepUp] = useState<StepUpRequest | null>(null);

  useEffect(() => {
    setData(null);
    adminApi
      .project(slug)
      .then((d) => {
        setData(d);
        setMeta(metaFromProject(d));
      })
      .catch(onError);
  }, [slug, onError]);

  if (!data || !meta) return <Loader2 className="mx-auto mt-10 size-5 animate-spin text-slate-400" />;

  async function save(withPlan = false) {
    if (!meta) return;
    setBusy(true);
    try {
      await adminApi.saveProject({ slug, meta, ...(withPlan && plan ? { plan: plan.plan, preview: plan.preview } : {}) });
      notify(true, withPlan ? 'Plano reemplazado' : 'Cambios guardados');
      if (withPlan) {
        setPlan(null);
        setShowPlan(false);
      }
      onChanged();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  const visible = data._admin.visible;

  return (
    <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto p-4">
      {/* Visibilidad */}
      <div
        className={cx(
          'mb-4 flex items-center gap-3 rounded-2xl p-3 ring-1',
          visible ? 'bg-brand-50 ring-brand-100' : 'bg-amber-50 ring-amber-200',
        )}
      >
        {visible ? <Eye className="text-brand-700 size-5" /> : <EyeOff className="size-5 text-amber-700" />}
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-bold text-slate-900">{visible ? 'Visible en el sitio' : 'Oculto en el sitio'}</div>
          <div className="text-xs text-slate-600">
            {visible ? 'Aparece en el inicio y su enlace funciona.' : 'Solo tú lo ves en el panel.'}
          </div>
        </div>
        <button
          onClick={() =>
            setStepUp({
              title: visible ? 'Ocultar proyecto' : 'Publicar proyecto',
              description: visible ? `"${data.name}" dejará de verse en el sitio.` : `"${data.name}" aparecerá en el inicio del sitio.`,
              confirmLabel: visible ? 'Ocultar' : 'Publicar',
              run: async (password, code) => {
                await adminApi.setVisibility(slug, !visible, password, code);
                setData({ ...data, _admin: { ...data._admin, visible: !visible } });
                notify(true, visible ? 'Proyecto oculto' : 'Proyecto publicado');
                onChanged();
              },
            })
          }
          className="h-9 shrink-0 rounded-xl bg-white px-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300"
        >
          {visible ? 'Ocultar' : 'Publicar'}
        </button>
      </div>

      <ProjectForm slug={slug} meta={meta} onChange={setMeta} />

      <button
        disabled={busy}
        onClick={() => save(false)}
        className="bg-brand-600 hover:bg-brand-700 sticky bottom-0 mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-bold text-white shadow-lg disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar cambios
      </button>

      <OwnerAccess slug={slug} projectName={data.name} onError={onError} notify={notify} />

      {/* Plano */}
      <div className="mt-6 space-y-3 rounded-2xl p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Plano del proyecto</h3>
            <p className="text-xs text-slate-500">
              {data.stats.total} lotes · {data.stats.manzanas} manzanas
            </p>
          </div>
          <button onClick={() => setShowPlan((v) => !v)} className="text-brand-700 text-sm font-bold hover:underline">
            {showPlan ? 'Cancelar' : 'Reemplazar plano'}
          </button>
        </div>
        {showPlan && (
          <>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              Los estados y precios ya editados se conservan para los lotes que tengan el mismo nombre (ej. "Lote 3 12").
            </p>
            <PlanUploader name={meta.name} result={plan} onResult={setPlan} />
            {plan && plan.plan.lots.length > 0 && (
              <button
                disabled={busy}
                onClick={() => confirm('¿Reemplazar el plano publicado por este?') && save(true)}
                className="bg-brand-600 hover:bg-brand-700 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl font-bold text-white disabled:opacity-60"
              >
                <Check className="size-4" /> Usar este plano
              </button>
            )}
          </>
        )}
      </div>

      {/* Zona de peligro */}
      <div className="mt-6 rounded-2xl p-4 ring-1 ring-rose-200">
        <h3 className="text-sm font-extrabold text-rose-700">Eliminar proyecto</h3>
        <p className="mt-1 text-xs text-slate-600">
          Borra el proyecto, sus fotos y videos, y los estados editados.{' '}
          {data._admin.source === 'static' &&
            'Como este proyecto viene del repositorio, se retirará del sitio pero sus archivos originales seguirán en GitHub.'}
        </p>
        <button
          onClick={() =>
            setStepUp({
              title: 'Eliminar proyecto',
              description: (
                <>
                  Esta acción <b>no se puede deshacer</b>. Se eliminará "{data.name}" con su galería.
                </>
              ),
              confirmLabel: 'Eliminar definitivamente',
              danger: true,
              typeToConfirm: data.name,
              run: async (password, code, typed) => {
                await adminApi.deleteProject(slug, typed, password, code);
                notify(true, 'Proyecto eliminado');
                onDeleted();
              },
            })
          }
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700"
        >
          <Trash2 className="size-4" /> Eliminar proyecto…
        </button>
      </div>

      <StepUpDialog request={stepUp} onClose={() => setStepUp(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ asistente "Nuevo proyecto"

export function NewProjectWizard({
  open,
  onClose,
  onCreated,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
  existing: string[];
}) {
  const [step, setStep] = useState(1);
  const [meta, setMeta] = useState<ProjectMeta>(emptyMeta());
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setMeta(emptyMeta());
    setSlug('');
    setSlugTouched(false);
    setPlan(null);
    setError('');
  }, [open]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(meta.name));
  }, [meta.name, slugTouched]);

  const slugError = !slug
    ? 'Escribe el nombre'
    : slug.length < 3
      ? 'Muy corto'
      : existing.includes(slug)
        ? 'Ya existe un proyecto con ese identificador'
        : '';

  async function create() {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.saveProject({ slug, create: true, meta, plan: plan.plan, preview: plan.preview });
      onCreated(slug);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="bg-brand-950/70 fixed inset-0 z-[70] grid place-items-center p-0 backdrop-blur-sm sm:p-4"
        >
          <motion.div
            initial={{ y: 20, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            className="flex h-full max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-brand-600 text-xs font-bold tracking-wider uppercase">Nuevo proyecto · Paso {step} de 3</div>
                <div className="text-lg font-extrabold text-slate-900">
                  {['Datos del proyecto', 'Plano DXF', 'Revisar y crear'][step - 1]}
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid size-10 place-items-center rounded-xl bg-slate-100 hover:bg-slate-200"
                aria-label="Cerrar"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto p-5">
              {step === 1 && (
                <div className="space-y-4">
                  <ProjectForm slug={slug} meta={meta} onChange={setMeta} compact />
                  <L label="Identificador para el enlace" hint={slugError || `El proyecto quedará en /proyecto/${slug}`}>
                    <input
                      className={cx(inputCls, slugError && meta.name && 'border-rose-300')}
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(slugify(e.target.value));
                      }}
                    />
                  </L>
                </div>
              )}
              {step === 2 && <PlanUploader name={meta.name} result={plan} onResult={setPlan} />}
              {step === 3 && plan && (
                <div className="space-y-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                    <div className="text-lg font-extrabold text-slate-900">{meta.name}</div>
                    <div className="text-slate-600">{meta.tagline}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      /proyecto/{slug} · {meta.location.city} {meta.location.region && `· ${meta.location.region}`}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-slate-800">
                      {plan.plan.stats.total} lotes · {plan.plan.stats.manzanas} manzanas · {m2(Math.round(plan.plan.stats.areaTotal))}
                    </div>
                  </div>
                  <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                    <EyeOff className="mt-0.5 size-3.5 shrink-0" /> El proyecto se crea <b>oculto</b>. Completa logo, descripción,
                    destacados y galería, y publícalo desde la pestaña <b>Proyecto</b> (pide doble autorización).
                  </p>
                  {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}
                </div>
              )}
            </div>

            <div className="flex shrink-0 gap-2 border-t border-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {step > 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-slate-100 px-4 font-bold text-slate-700 hover:bg-slate-200"
                >
                  <ArrowLeft className="size-4" /> Atrás
                </button>
              )}
              {step < 3 ? (
                <button
                  disabled={(step === 1 && (!meta.name.trim() || !!slugError)) || (step === 2 && (!plan || plan.plan.lots.length === 0))}
                  onClick={() => setStep(step + 1)}
                  className="bg-brand-600 hover:bg-brand-700 ml-auto inline-flex h-12 items-center gap-2 rounded-xl px-5 font-bold text-white disabled:opacity-40"
                >
                  Siguiente <ArrowRight className="size-4" />
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={create}
                  className="bg-brand-600 hover:bg-brand-700 ml-auto inline-flex h-12 items-center gap-2 rounded-xl px-5 font-bold text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Crear proyecto
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ------------------------------------------------------------------ acceso del dueño

function OwnerAccess({
  slug,
  projectName,
  onError,
  notify,
}: {
  slug: string;
  projectName: string;
  onError: (e: unknown) => void;
  notify: (ok: boolean, msg: string) => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.owners>> | null>(null);
  const [link, setLink] = useState<{ url: string; expires: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => adminApi.owners(slug).then(setData).catch(onError), [slug, onError]);
  useEffect(() => {
    load();
  }, [load]);

  async function invite() {
    setBusy(true);
    try {
      const r = await adminApi.inviteOwner(slug);
      setLink({ url: r.link, expires: r.expires });
      load();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  const message = link
    ? `Hola, este es tu acceso para actualizar el estado de los lotes de ${projectName} en ${SITE.name}. Ábrelo y crea tu cuenta (es de un solo uso y vence el ${new Date(link.expires).toLocaleDateString('es-CO')}):\n${link.url}`
    : '';

  return (
    <div className="mt-6 space-y-3 rounded-2xl p-4 ring-1 ring-slate-200">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <UserCog className="text-brand-600 size-4" /> Acceso del dueño del proyecto
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          El dueño entra por <b>/dueno</b> y <b>solo</b> puede cambiar el estado de los lotes (disponible, reservado, vendido). No puede
          cambiar precios, fotos, textos ni el plano.
        </p>
      </div>

      {data?.owners.map((o) => (
        <div key={o.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-bold text-slate-900">{o.name || o.email}</div>
            <div className="truncate text-xs text-slate-500">
              {o.email} · {o.last_login ? `último ingreso ${new Date(o.last_login).toLocaleDateString('es-CO')}` : 'aún no ingresa'}
            </div>
          </div>
          <button
            onClick={async () => {
              if (!confirm(`¿Quitar el acceso de ${o.email} a "${projectName}"? Dejará de poder cambiar estados de inmediato.`)) return;
              try {
                await adminApi.revokeOwner(o.id, slug);
                notify(true, 'Acceso retirado');
                load();
              } catch (e) {
                onError(e);
              }
            }}
            className="h-9 shrink-0 rounded-lg px-3 text-xs font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
          >
            Quitar acceso
          </button>
        </div>
      ))}
      {data && data.owners.length === 0 && <p className="text-xs text-slate-500">Ningún dueño tiene acceso todavía.</p>}

      {data && data.invites.length > 0 && (
        <div className="space-y-1">
          {data.invites.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200"
            >
              <span>Invitación pendiente · vence el {new Date(i.expires_at).toLocaleDateString('es-CO')}</span>
              <button
                onClick={async () => {
                  try {
                    await adminApi.cancelInvite(i.id);
                    if (link) setLink(null);
                    load();
                  } catch (e) {
                    onError(e);
                  }
                }}
                className="font-bold underline"
              >
                Anular
              </button>
            </div>
          ))}
        </div>
      )}

      {link ? (
        <div className="bg-brand-50 ring-brand-200 space-y-2 rounded-xl p-3 ring-1">
          <p className="text-brand-900 text-xs font-bold">
            Enlace de invitación (de un solo uso, vence en 7 días). Cópialo ahora: por seguridad no se vuelve a mostrar.
          </p>
          <code className="block rounded-lg bg-white p-2 text-[11px] break-all text-slate-700 select-all">{link.url}</code>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener"
              className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold text-white"
            >
              Enviar por WhatsApp
            </a>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(message);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
            >
              {copied ? 'Copiado ✔' : 'Copiar mensaje'}
            </button>
          </div>
        </div>
      ) : (
        <button
          disabled={busy}
          onClick={invite}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-800 ring-1 ring-slate-200 hover:ring-slate-300 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Crear enlace de invitación
        </button>
      )}
    </div>
  );
}
