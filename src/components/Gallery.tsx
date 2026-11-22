import { ChevronLeft, ChevronRight, Images, Play, X } from 'lucide-react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { asset } from '../lib/data';
import { cx } from '../lib/format';
import type { GalleryItem } from '../types';

/** Imagen con vista previa borrosa mientras carga. */
function BlurImg({ item, src, className = '', eager }: { item: GalleryItem; src: string; className?: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={cx('relative block overflow-hidden bg-slate-200', className)}>
      {item.blur && (
        <img
          src={item.blur}
          alt=""
          aria-hidden
          className={cx(
            'absolute inset-0 h-full w-full scale-110 object-cover blur-lg transition-opacity duration-500',
            loaded && 'opacity-0',
          )}
        />
      )}
      <img
        src={asset(src)}
        alt={item.caption}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cx('relative h-full w-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
      />
    </span>
  );
}

/** Miniatura (foto, portada de video o primer cuadro del video). */
function Thumb({ item, className }: { item: GalleryItem; className?: string }) {
  return (
    <span className={cx('relative block', className)}>
      {item.thumb ? (
        <BlurImg item={item} src={item.thumb} className="h-full w-full" />
      ) : (
        <video src={`${asset(item.src)}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full bg-slate-800 object-cover" />
      )}
      {item.type === 'video' && (
        <span className="absolute inset-0 grid place-items-center bg-black/15">
          <span className="text-brand-700 grid size-11 place-items-center rounded-full bg-white/90 shadow-lg backdrop-blur transition group-hover:scale-110">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
      )}
    </span>
  );
}

/** Mosaico para el panel del proyecto: una pieza grande + hasta 3 pequeñas. */
export function GalleryMosaic({ items, onOpen }: { items: GalleryItem[]; onOpen: (i: number) => void }) {
  if (!items.length) return null;
  const [first, ...rest] = items;
  const small = rest.slice(0, 3);
  const more = items.length - 1 - small.length;
  return (
    <div className="grid gap-1.5 overflow-hidden rounded-2xl">
      <button onClick={() => onOpen(0)} className="group relative aspect-[16/9] overflow-hidden" aria-label={`Ver ${first.caption}`}>
        <Thumb item={first} className="h-full w-full transition duration-500 group-hover:scale-[1.03]" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pt-8 pb-2 text-left text-xs font-semibold text-white">
          {first.caption}
        </span>
      </button>
      {small.length > 0 && (
        <div className={cx('grid gap-1.5', small.length === 1 ? 'grid-cols-1' : small.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {small.map((it, i) => (
            <button
              key={it.src}
              onClick={() => onOpen(i + 1)}
              className="group relative aspect-[4/3] overflow-hidden"
              aria-label={`Ver ${it.caption}`}
            >
              <Thumb item={it} className="h-full w-full transition duration-500 group-hover:scale-105" />
              {i === small.length - 1 && more > 0 && (
                <span className="bg-brand-950/60 absolute inset-0 grid place-items-center text-lg font-extrabold text-white backdrop-blur-[2px]">
                  +{more}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Visor a pantalla completa: deslizar, flechas del teclado, miniaturas. */
export function Lightbox({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: GalleryItem[];
  index: number | null;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const [dir, setDir] = useState(0);
  const open = index != null;
  const go = useCallback(
    (d: number) => {
      if (index == null) return;
      setDir(d);
      onIndex((index + d + items.length) % items.length);
    },
    [index, items.length, onIndex],
  );

  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (['Escape', 'ArrowRight', 'ArrowLeft'].includes(e.key)) e.stopPropagation();
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', on, true);
    return () => {
      window.removeEventListener('keydown', on, true);
      document.body.style.overflow = prev;
    };
  }, [open, go, onClose]);

  // Precargar vecinas
  useEffect(() => {
    if (index == null) return;
    for (const d of [1, -1]) {
      const it = items[(index + d + items.length) % items.length];
      if (it?.type === 'image') new Image().src = asset(it.src);
    }
  }, [index, items]);

  const thumbs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    thumbs.current
      ?.querySelector<HTMLElement>(`[data-i="${index}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

  const item = index != null ? items[index] : null;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) go(1);
    else if (info.offset.x > 60 || info.velocity.x > 400) go(-1);
  };

  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="bg-brand-950/[0.97] fixed inset-0 z-[70] flex flex-col text-white backdrop-blur-xl"
          role="dialog"
          aria-modal
          aria-label="Galería"
        >
          {/* Barra superior */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold tabular-nums">
              <Images className="text-brand-300 size-4" /> {index! + 1} / {items.length}
            </span>
            <button
              onClick={onClose}
              className="grid size-11 place-items-center rounded-2xl bg-white/10 transition hover:bg-white/20"
              aria-label="Cerrar galería"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Pieza actual */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div
                key={item.src}
                custom={dir}
                initial={{ opacity: 0, x: dir * 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -80 }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                drag={items.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.35}
                onDragEnd={onDragEnd}
                className="absolute inset-0 grid place-items-center px-2 sm:px-20"
              >
                {item.type === 'image' ? (
                  <img
                    src={asset(item.src)}
                    alt={item.caption}
                    draggable={false}
                    className="max-h-full max-w-full rounded-xl object-contain shadow-2xl select-none"
                    style={item.blur ? { backgroundImage: `url(${item.blur})`, backgroundSize: 'cover' } : undefined}
                    width={item.w}
                    height={item.h}
                  />
                ) : (
                  <video
                    src={asset(item.src)}
                    poster={item.poster ? asset(item.poster) : undefined}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="max-h-full max-w-full rounded-xl bg-black shadow-2xl"
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {items.length > 1 && (
              <>
                <button
                  onClick={() => go(-1)}
                  className="absolute top-1/2 left-3 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/25 sm:grid"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  onClick={() => go(1)}
                  className="absolute top-1/2 right-3 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/25 sm:grid"
                  aria-label="Siguiente"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>

          {/* Pie: texto + miniaturas */}
          <div className="shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="text-brand-50/85 mx-auto mb-3 max-w-2xl text-center text-sm">{item.caption}</p>
            {items.length > 1 && (
              <div ref={thumbs} className="mx-auto flex max-w-3xl scrollbar-thin gap-2 overflow-x-auto pb-1 sm:justify-center">
                {items.map((it, i) => (
                  <button
                    key={it.src}
                    data-i={i}
                    onClick={() => {
                      setDir(i > index! ? 1 : -1);
                      onIndex(i);
                    }}
                    className={cx(
                      'group relative h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition',
                      i === index ? 'ring-brand-400 opacity-100' : 'opacity-50 ring-transparent hover:opacity-90',
                    )}
                    aria-label={it.caption}
                  >
                    <Thumb item={it} className="h-full w-full [&_span.size-11]:size-7 [&_svg]:size-3.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
