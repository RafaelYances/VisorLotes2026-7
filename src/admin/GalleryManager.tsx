import { CheckCircle2, GripVertical, ImagePlus, Loader2, Play, Star, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { asset } from '../lib/data';
import { cx } from '../lib/format';
import type { GalleryItem } from '../types';
import { adminApi } from './api';
import { prepareImage, prepareVideo, uploadPrepared, VIDEO_WARN_MB } from './media';

interface Job {
  key: string;
  name: string;
  pct: number;
  state: 'preparing' | 'uploading' | 'done' | 'error';
  error?: string;
  warn?: string;
}

export function GalleryManager({
  project,
  onError,
  notify,
}: {
  project: string;
  onError: (e: unknown) => void;
  notify: (ok: boolean, msg: string) => void;
}) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const orderTimer = useRef(0);

  const reload = useCallback(
    () =>
      adminApi
        .gallery(project)
        .then((r) => setItems(r.items))
        .catch(onError),
    [project, onError],
  );
  useEffect(() => {
    setItems(null);
    reload();
  }, [reload]);

  const patchJob = (key: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j)));

  async function addFiles(files: FileList | File[]) {
    const list = [...files];
    const newJobs = list.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, pct: 0, state: 'preparing' as const }));
    setJobs((js) => [...newJobs, ...js].slice(0, 30));
    // De uno en uno para no saturar la conexión del celular
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const job = newJobs[i];
      try {
        const isVideo = f.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(f.name);
        const prepared = isVideo ? await prepareVideo(f) : await prepareImage(f);
        const warn =
          isVideo && f.size > VIDEO_WARN_MB * 1024 * 1024
            ? `Pesa ${(f.size / 1048576).toFixed(0)} MB: en celular puede tardar en cargar.`
            : undefined;
        patchJob(job.key, { state: 'uploading', warn });
        await uploadPrepared(project, prepared, (pct) => patchJob(job.key, { pct }));
        patchJob(job.key, { state: 'done', pct: 100 });
      } catch (e) {
        if ((e as { status?: number }).status === 401) return onError(e);
        patchJob(job.key, { state: 'error', error: e instanceof Error ? e.message : 'Error' });
      }
    }
    await reload();
  }

  async function save(changes: { order?: string[]; items?: { id: string; caption?: string; cover?: boolean }[] }, msg?: string) {
    try {
      const r = await adminApi.galleryUpdate(project, changes);
      setItems(r.items);
      if (msg) notify(true, msg);
    } catch (e) {
      onError(e);
      reload();
    }
  }

  function reorder(next: GalleryItem[]) {
    setItems(next);
    window.clearTimeout(orderTimer.current);
    orderTimer.current = window.setTimeout(() => save({ order: next.map((i) => i.id!) }, 'Orden guardado'), 700);
  }

  async function remove(it: GalleryItem) {
    if (!confirm(`¿Eliminar "${it.caption || (it.type === 'video' ? 'este video' : 'esta foto')}" de la galería? No se puede deshacer.`))
      return;
    try {
      await adminApi.galleryDelete(project, it.id!);
      setItems((xs) => xs?.filter((x) => x.id !== it.id) ?? null);
      notify(true, 'Elemento eliminado');
    } catch (e) {
      onError(e);
    }
  }

  return (
    <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto p-4">
      {/* Zona de subida */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        className={cx(
          'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition',
          drag ? 'border-brand-500 bg-brand-50' : 'hover:border-brand-400 border-slate-300 hover:bg-slate-50',
        )}
      >
        <UploadCloud className="text-brand-600 size-8" />
        <p className="text-sm font-bold text-slate-800">Arrastra fotos o videos aquí, o toca para elegirlos</p>
        <p className="text-xs text-slate-500">
          Fotos JPG, PNG o WebP (se optimizan solas). Videos MP4 o WebM de hasta 60 MB (ideal &lt; 15 MB).
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Progreso */}
      {jobs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {jobs.map((j) => (
            <li key={j.key} className="rounded-xl bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-100">
              <div className="flex items-center gap-2">
                {j.state === 'done' ? (
                  <CheckCircle2 className="text-brand-600 size-4 shrink-0" />
                ) : j.state === 'error' ? (
                  <XCircle className="size-4 shrink-0 text-rose-600" />
                ) : (
                  <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
                )}
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{j.name}</span>
                <span className="text-slate-500">
                  {j.state === 'preparing' ? 'Optimizando…' : j.state === 'uploading' ? `${j.pct}%` : j.state === 'done' ? 'Listo' : ''}
                </span>
              </div>
              {j.state === 'uploading' && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
                  <div className="bg-brand-500 h-full transition-all" style={{ width: `${j.pct}%` }} />
                </div>
              )}
              {j.error && <p className="mt-1 text-rose-700">{j.error}</p>}
              {j.warn && j.state !== 'error' && <p className="mt-1 text-amber-700">{j.warn}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Elementos */}
      <div className="mt-5 mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase">En el sitio ({items?.length ?? 0})</h3>
        <span className="text-[11px] text-slate-400">Arrastra ⠿ para ordenar</span>
      </div>
      {!items && <Loader2 className="mx-auto mt-6 size-5 animate-spin text-slate-400" />}
      {items?.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          <ImagePlus className="size-6" /> Aún no hay fotos ni videos en este proyecto.
        </div>
      )}
      {items && items.length > 0 && (
        <Reorder.Group axis="y" values={items} onReorder={reorder} className="space-y-2">
          {items.map((it) => (
            <Row
              key={it.id}
              item={it}
              onCaption={(c) => save({ items: [{ id: it.id!, caption: c }] }, 'Texto guardado')}
              onCover={() => save({ items: [{ id: it.id!, cover: true }] }, 'Portada actualizada')}
              onDelete={() => remove(it)}
            />
          ))}
        </Reorder.Group>
      )}
    </div>
  );
}

function Row({
  item,
  onCaption,
  onCover,
  onDelete,
}: {
  item: GalleryItem;
  onCaption: (c: string) => void;
  onCover: () => void;
  onDelete: () => void;
}) {
  const controls = useDragControls();
  const [caption, setCaption] = useState(item.caption);
  useEffect(() => setCaption(item.caption), [item.caption]);
  const commit = () => caption.trim() !== item.caption && onCaption(caption.trim());
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-2xl bg-white p-2 ring-1 ring-slate-200"
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        className="grid h-14 w-6 shrink-0 cursor-grab touch-none place-items-center text-slate-400 active:cursor-grabbing"
        aria-label="Arrastrar para ordenar"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-200">
        {item.thumb ? (
          <img src={asset(item.thumb)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : item.type === 'video' ? (
          <video src={`${asset(item.src)}#t=0.5`} preload="metadata" muted className="h-full w-full object-cover" />
        ) : (
          <img src={asset(item.src)} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        {item.type === 'video' && (
          <span className="absolute inset-0 grid place-items-center bg-black/20">
            <Play className="size-5 fill-white text-white" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          maxLength={200}
          placeholder="Escribe un texto…"
          className="focus:border-brand-500 h-9 w-full rounded-lg border border-transparent bg-slate-50 px-2 text-sm outline-none focus:bg-white"
        />
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
          {item.type === 'video' ? 'Video' : 'Foto'}
          {item.sizeMB ? ` · ${item.sizeMB} MB` : ''}
          {item.cover && <span className="bg-brand-100 text-brand-700 rounded-full px-1.5 font-bold">PORTADA</span>}
        </div>
      </div>
      {item.type === 'image' && (
        <button
          onClick={onCover}
          title="Usar como portada"
          className={cx(
            'grid size-9 shrink-0 place-items-center rounded-lg transition',
            item.cover ? 'text-amber-500' : 'text-slate-400 hover:bg-slate-100',
          )}
        >
          <Star className={cx('size-4', item.cover && 'fill-amber-400')} />
        </button>
      )}
      <button
        onClick={onDelete}
        title="Eliminar"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
      >
        <Trash2 className="size-4" />
      </button>
    </Reorder.Item>
  );
}
