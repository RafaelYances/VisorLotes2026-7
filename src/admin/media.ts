/**
 * Preparación de fotos y videos en el navegador antes de subirlos:
 * las fotos se reducen y comprimen (WebP, o JPEG en navegadores que no generan WebP)
 * y de los videos se toma un cuadro como portada.
 */

export interface Prepared {
  type: 'image' | 'video';
  files: Record<string, Blob>;
  meta: { type: 'image' | 'video'; caption: string; w?: number; h?: number; blur?: string };
}

export const VIDEO_MAX_MB = 60;
export const VIDEO_WARN_MB = 15;

function canvasBlob(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (!b) return reject(new Error('No se pudo procesar la imagen'));
        if (b.type === 'image/webp') return resolve(b);
        // Safari antiguo: no genera WebP → JPEG
        c.toBlob((j) => (j ? resolve(j) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality);
      },
      'image/webp',
      quality,
    );
  });
}

function draw(src: CanvasImageSource, sw: number, sh: number, max: number) {
  const r = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * r));
  c.height = Math.max(1, Math.round(sh * r));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

async function variants(src: CanvasImageSource, w: number, h: number, big: number) {
  const full = draw(src, w, h, big);
  const thumb = draw(src, w, h, 640);
  const tiny = draw(src, w, h, 16);
  const blur = tiny.toDataURL('image/webp', 0.4).startsWith('data:image/webp')
    ? tiny.toDataURL('image/webp', 0.4)
    : tiny.toDataURL('image/jpeg', 0.4);
  return { full: await canvasBlob(full, 0.8), thumb: await canvasBlob(thumb, 0.7), blur, w: full.width, h: full.height };
}

/** Texto sugerido a partir del nombre del archivo: "03-vista-al-mar.jpg" → "Vista al mar". */
export const captionFromName = (name: string) => {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[\s._-]*/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base && !/^(img|dsc|vid|pxl|whatsapp)/i.test(base) ? base[0].toUpperCase() + base.slice(1) : '';
};

export async function prepareImage(file: File): Promise<Prepared> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Formato de imagen no compatible. Usa JPG, PNG o WebP (las fotos HEIC del iPhone, expórtalas como JPG).');
  }
  const v = await variants(bmp, bmp.width, bmp.height, 1920);
  bmp.close();
  return {
    type: 'image',
    files: { full: v.full, thumb: v.thumb },
    meta: { type: 'image', caption: captionFromName(file.name), w: v.w, h: v.h, blur: v.blur },
  };
}

export async function prepareVideo(file: File): Promise<Prepared> {
  if (!/^video\/(mp4|webm)$/.test(file.type) && !/\.(mp4|webm)$/i.test(file.name))
    throw new Error('Formato de video no permitido. Usa MP4 o WebM (puedes convertirlo gratis con HandBrake).');
  if (file.size > VIDEO_MAX_MB * 1024 * 1024)
    throw new Error(`El video pesa más de ${VIDEO_MAX_MB} MB. Comprímelo a 720p y 15–30 segundos.`);
  const out: Prepared = { type: 'video', files: { video: file }, meta: { type: 'video', caption: captionFromName(file.name) } };
  // Portada: un cuadro del video (si el navegador puede leerlo)
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise<void>((res, rej) => {
      video.onloadeddata = () => res();
      video.onerror = () => rej(new Error('video'));
      setTimeout(() => rej(new Error('timeout')), 15000);
    });
    video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    await new Promise<void>((res) => {
      video.onseeked = () => res();
      setTimeout(res, 3000);
    });
    const v = await variants(video, video.videoWidth, video.videoHeight, 1280);
    URL.revokeObjectURL(url);
    out.files.poster = v.full;
    out.files.thumb = v.thumb;
    Object.assign(out.meta, { w: v.w, h: v.h, blur: v.blur });
  } catch {
    /* sin portada: se mostrará el primer cuadro del video */
  }
  return out;
}

/** Sube con barra de progreso. */
export function uploadPrepared(project: string, p: Prepared, onProgress: (pct: number) => void): Promise<{ ok: true; id: string }> {
  const fd = new FormData();
  fd.append('project', project);
  fd.append('meta', JSON.stringify(p.meta));
  for (const [k, blob] of Object.entries(p.files)) fd.append(k, blob, k);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${import.meta.env.BASE_URL}api/admin/gallery/upload`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta vacía */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as { ok: true; id: string });
      else reject(Object.assign(new Error(data.error || `Error ${xhr.status}`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Sin conexión con el servidor'));
    xhr.send(fd);
  });
}
