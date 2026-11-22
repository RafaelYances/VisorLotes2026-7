/**
 * Galería de cada proyecto.
 *
 *   data/projects/<slug>/galeria/      → fotos (.jpg .jpeg .png .webp) y videos (.mp4 .webm)
 *   project.json → "gallery": [{ "file": "fachada.jpg", "caption": "…", "cover": true }]   (opcional)
 *
 * Las fotos se optimizan a WebP (1920 px y miniatura de 640 px) y llevan una vista previa
 * borrosa diminuta para que la carga se vea suave. Los videos se copian tal cual: deben pesar
 * menos de 25 MB (límite por archivo de Cloudflare); se recomienda < 15 MB, 720p–1080p, 15–30 s.
 * Un video puede tener portada propia: "recorrido.mp4" + "recorrido.poster.jpg".
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VID = new Set(['.mp4', '.webm']);
const MB = 1024 * 1024;
const VIDEO_MAX = 25 * MB;
const VIDEO_WARN = 15 * MB;

const prettyName = (file) => {
  const base = path
    .parse(file)
    .name.replace(/^\d+[\s._-]*/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base ? base[0].toUpperCase() + base.slice(1) : '';
};

const isFresh = (out, src) => fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs;

async function image(src, outDir, name) {
  const full = path.join(outDir, `${name}.webp`);
  const thumb = path.join(outDir, `${name}.thumb.webp`);
  if (!isFresh(full, src))
    await sharp(src)
      .rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(full);
  if (!isFresh(thumb, src))
    await sharp(src)
      .rotate()
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 68 })
      .toFile(thumb);
  const meta = await sharp(full).metadata();
  const blur = await sharp(src).rotate().resize(16, 16, { fit: 'inside' }).webp({ quality: 40 }).toBuffer();
  return { w: meta.width, h: meta.height, blur: `data:image/webp;base64,${blur.toString('base64')}` };
}

export async function buildGallery({ slug, dir, meta, publicDir }) {
  const srcDir = path.join(dir, 'galeria');
  const outDir = path.join(publicDir, 'media', slug);
  const rel = (f) => `media/${slug}/${f}`;
  if (!fs.existsSync(srcDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
    return { items: [], cover: null };
  }
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs
    .readdirSync(srcDir)
    .filter((f) => !f.startsWith('.') && !/\.poster\.[a-z]+$/i.test(f))
    .filter(
      (f) =>
        IMG.has(path.extname(f).toLowerCase()) ||
        VID.has(path.extname(f).toLowerCase()) ||
        console.warn(`  ⚠ galería ${slug}: formato no soportado, se omite "${f}" (usa jpg, png, webp, mp4 o webm)`),
    )
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  // Orden y textos: primero lo definido en project.json, luego el resto por nombre
  const config = Array.isArray(meta.gallery) ? meta.gallery : [];
  const listed = config.map((c) => c.file).filter((f) => files.includes(f));
  config
    .filter((c) => !files.includes(c.file))
    .forEach((c) => console.warn(`  ⚠ galería ${slug}: "${c.file}" está en project.json pero no en la carpeta galeria/`));
  const ordered = [...listed, ...files.filter((f) => !listed.includes(f))];

  const used = new Set();
  const items = [];
  for (const file of ordered) {
    const src = path.join(srcDir, file);
    const ext = path.extname(file).toLowerCase();
    const cfg = config.find((c) => c.file === file) ?? {};
    const name =
      path
        .parse(file)
        .name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'item';
    const caption = cfg.caption ?? prettyName(file);

    if (IMG.has(ext)) {
      const { w, h, blur } = await image(src, outDir, name);
      used.add(`${name}.webp`).add(`${name}.thumb.webp`);
      items.push({ type: 'image', src: rel(`${name}.webp`), thumb: rel(`${name}.thumb.webp`), w, h, blur, caption, cover: !!cfg.cover });
    } else {
      const size = fs.statSync(src).size;
      if (size > VIDEO_MAX) {
        console.error(
          `  ✘ galería ${slug}: "${file}" pesa ${(size / MB).toFixed(1)} MB y supera el límite de 25 MB de Cloudflare. Se omite: comprímelo (720p, 15–30 s).`,
        );
        continue;
      }
      if (size > VIDEO_WARN)
        console.warn(
          `  ⚠ galería ${slug}: "${file}" pesa ${(size / MB).toFixed(1)} MB; se recomienda menos de 15 MB para que cargue rápido en celular.`,
        );
      const out = `${name}${ext}`;
      if (!isFresh(path.join(outDir, out), src)) fs.copyFileSync(src, path.join(outDir, out));
      used.add(out);
      const item = { type: 'video', src: rel(out), caption, cover: false, sizeMB: Math.round((size / MB) * 10) / 10 };
      const posterSrc = ['jpg', 'jpeg', 'png', 'webp']
        .map((e) => path.join(srcDir, `${path.parse(file).name}.poster.${e}`))
        .find((p) => fs.existsSync(p));
      if (posterSrc) {
        const { w, h, blur } = await image(posterSrc, outDir, `${name}.poster`);
        used.add(`${name}.poster.webp`).add(`${name}.poster.thumb.webp`);
        Object.assign(item, { poster: rel(`${name}.poster.webp`), thumb: rel(`${name}.poster.thumb.webp`), w, h, blur });
      }
      items.push(item);
    }
  }

  // Borrar archivos generados que ya no existen en la fuente
  for (const f of fs.readdirSync(outDir)) if (!used.has(f)) fs.rmSync(path.join(outDir, f));

  const coverItem = items.find((i) => i.cover && i.type === 'image') ?? items.find((i) => i.type === 'image') ?? null;
  const cover = coverItem ? { src: coverItem.src, thumb: coverItem.thumb, blur: coverItem.blur } : null;
  return { items, cover };
}
