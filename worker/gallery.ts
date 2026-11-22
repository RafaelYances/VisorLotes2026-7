/**
 * Galería de fotos y videos gestionada desde el panel.
 * - Los archivos se guardan en Cloudflare R2 y se sirven en /files/…
 * - Los datos (orden, textos, portada) se guardan en D1.
 * - La primera vez que se abre la galería de un proyecto en el panel, se copian
 *   las fotos que ya tenía publicadas (desde la carpeta galeria/ del repositorio).
 */
import { audit } from './db';
import { body, fail, json, originOk, sameOrigin } from './http';
import { loadDetail } from './projects';

const SLUG = /^[a-z0-9-]{1,60}$/;
const ID = /^[a-f0-9-]{36}$/;
const MB = 1024 * 1024;
const LIMITS = { full: 10 * MB, thumb: 1.5 * MB, poster: 4 * MB, video: 60 * MB } as const;
type Kind = keyof typeof LIMITS;

interface Row {
  id: string;
  project: string;
  type: 'image' | 'video';
  src: string;
  thumb: string | null;
  poster: string | null;
  w: number | null;
  h: number | null;
  blur: string | null;
  caption: string;
  cover: number;
  position: number;
  bytes: number;
  r2keys: string;
}

/** Forma pública de una pieza (igual a la que genera build-data.mjs). */
const toItem = (r: Row) => ({
  id: r.id,
  type: r.type,
  src: r.src,
  thumb: r.thumb ?? undefined,
  poster: r.poster ?? undefined,
  w: r.w ?? undefined,
  h: r.h ?? undefined,
  blur: r.blur ?? undefined,
  caption: r.caption,
  cover: !!r.cover,
  sizeMB: r.bytes ? Math.round((r.bytes / MB) * 10) / 10 : undefined,
});

async function rows(db: D1Database, project: string) {
  const { results } = await db.prepare('SELECT * FROM gallery WHERE project = ? ORDER BY position, created_at').bind(project).all<Row>();
  return results;
}

async function isSeeded(db: D1Database, project: string) {
  return !!(await db.prepare("SELECT 1 FROM project_flags WHERE project = ? AND flag = 'gallery'").bind(project).first());
}

/** Copia a la base de datos la galería publicada del proyecto (solo una vez). */
async function seed(env: Env, req: Request, project: string) {
  if (await isSeeded(env.DB, project)) return true;
  const data = (await loadDetail(env, req, project, true)) as { gallery?: Record<string, unknown>[] } | null;
  if (!data) return false;
  const now = Date.now();
  const stmts = (data.gallery ?? []).map((g, i) =>
    env.DB.prepare(
      'INSERT INTO gallery (id, project, type, src, thumb, poster, w, h, blur, caption, cover, position, bytes, r2keys, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      crypto.randomUUID(),
      project,
      g.type === 'video' ? 'video' : 'image',
      String(g.src),
      (g.thumb as string) ?? null,
      (g.poster as string) ?? null,
      (g.w as number) ?? null,
      (g.h as number) ?? null,
      (g.blur as string) ?? null,
      String(g.caption ?? '').slice(0, 200),
      g.cover ? 1 : 0,
      i,
      Math.round(((g.sizeMB as number) ?? 0) * MB),
      '[]',
      now,
    ),
  );
  stmts.push(env.DB.prepare("INSERT OR IGNORE INTO project_flags (project, flag) VALUES (?, 'gallery')").bind(project));
  await env.DB.batch(stmts);
  return true;
}

// ------------------------------------------------------------------ público

/** Galería en vivo de un proyecto, o null si aún no se gestiona desde el panel. */
export async function galleryPublic(env: Env, project: string) {
  if (!SLUG.test(project)) return fail(404, 'No encontrado');
  if (!(await isSeeded(env.DB, project))) return json({ items: null }, 200, { 'Cache-Control': 'public, max-age=5' });
  return json({ items: (await rows(env.DB, project)).map(toItem) }, 200, { 'Cache-Control': 'public, max-age=5' });
}

/** Portada y conteo de fotos/videos por proyecto (para las tarjetas del inicio). */
export async function gallerySummary(db: D1Database) {
  const { results } = await db
    .prepare(
      "SELECT g.* FROM gallery g JOIN project_flags f ON f.project = g.project AND f.flag = 'gallery' ORDER BY g.project, g.position, g.created_at",
    )
    .all<Row>();
  const { results: flags } = await db.prepare("SELECT project FROM project_flags WHERE flag = 'gallery'").all<{ project: string }>();
  const out: Record<string, { cover: { src: string; thumb: string; blur: string } | null; photos: number; videos: number }> = {};
  for (const f of flags) out[f.project] = { cover: null, photos: 0, videos: 0 };
  for (const r of results) {
    const s = out[r.project];
    if (r.type === 'image') s.photos++;
    else s.videos++;
  }
  for (const p of Object.keys(out)) {
    const list = results.filter((r) => r.project === p && r.type === 'image');
    const c = list.find((r) => r.cover) ?? list[0];
    out[p].cover = c ? { src: c.src, thumb: c.thumb ?? c.src, blur: c.blur ?? '' } : null;
  }
  return out;
}

/** Sirve un archivo de R2 (con soporte de rangos para que los videos se puedan adelantar). */
export async function serveFile(env: Env, req: Request, key: string) {
  if (!/^p\/[a-z0-9-]{1,60}\/[a-f0-9-]{36}-(full|thumb|poster|video|logo)\.(webp|jpg|png|mp4|webm)$/.test(key))
    return new Response('No encontrado', { status: 404 });
  const headers = new Headers({
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Accept-Ranges': 'bytes',
    'Cross-Origin-Resource-Policy': 'same-origin',
    // Si alguien abre el archivo directamente, nunca puede ejecutar código
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
  });
  const range = req.headers.get('Range');
  const m = range?.match(/^bytes=(\d+)-(\d*)$/);
  if (m) {
    const head = await env.MEDIA.head(key);
    if (!head) return new Response('No encontrado', { status: 404 });
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), head.size - 1) : head.size - 1;
    if (start >= head.size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}` } });
    const obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!obj) return new Response('No encontrado', { status: 404 });
    headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'application/octet-stream');
    headers.set('Content-Range', `bytes ${start}-${end}/${head.size}`);
    headers.set('Content-Length', String(end - start + 1));
    headers.set('ETag', head.httpEtag);
    return new Response(obj.body, { status: 206, headers });
  }
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('No encontrado', { status: 404 });
  if (req.headers.get('If-None-Match') === obj.httpEtag) return new Response(null, { status: 304, headers });
  headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('Content-Length', String(obj.size));
  headers.set('ETag', obj.httpEtag);
  return new Response(obj.body, { headers });
}

// ------------------------------------------------------------------ panel (requiere sesión)

/** Verifica el tipo real del archivo por sus primeros bytes (no confía en el nombre). */
function sniff(buf: ArrayBuffer): 'image/webp' | 'image/jpeg' | 'video/mp4' | 'video/webm' | null {
  const b = new Uint8Array(buf.slice(0, 16));
  const ascii = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(4, 4) === 'ftyp') return 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}

async function upload(env: Env, req: Request, ip: string) {
  if (!originOk(req) || !(req.headers.get('Content-Type') || '').startsWith('multipart/form-data')) return fail(403, 'Origen no permitido');
  if (Number(req.headers.get('Content-Length') || 0) > 80 * MB) return fail(413, 'El archivo es demasiado grande');
  const form = await req.formData();
  const project = String(form.get('project') || '');
  if (!SLUG.test(project) || !(await seed(env, req, project))) return fail(404, 'Proyecto no encontrado');
  let meta: { type?: string; caption?: string; w?: number; h?: number; blur?: string };
  try {
    meta = JSON.parse(String(form.get('meta') || '{}'));
  } catch {
    return fail(400, 'Datos inválidos');
  }
  const type = meta.type === 'video' ? 'video' : 'image';
  const id = crypto.randomUUID();
  const kinds: Kind[] = type === 'image' ? ['full', 'thumb'] : ['video', 'poster', 'thumb'];
  // 1) Validar todos los archivos antes de guardar nada
  const ready: { kind: Kind; buf: ArrayBuffer; mime: string; ext: string }[] = [];
  for (const kind of kinds) {
    const file = form.get(kind);
    if (!(file instanceof File)) {
      if (kind === 'full' || kind === 'video') return fail(400, 'Falta el archivo');
      continue; // portada/miniatura del video: opcionales
    }
    if (file.size > LIMITS[kind])
      return fail(413, kind === 'video' ? 'El video supera 60 MB. Comprímelo (720p, 15–30 s).' : 'La imagen es demasiado grande');
    const buf = await file.arrayBuffer();
    const mime = sniff(buf);
    const okType = kind === 'video' ? mime === 'video/mp4' || mime === 'video/webm' : mime === 'image/webp' || mime === 'image/jpeg';
    if (!okType || !mime)
      return fail(415, kind === 'video' ? 'Formato de video no permitido (usa MP4 o WebM)' : 'Formato de imagen no permitido');
    ready.push({
      kind,
      buf,
      mime,
      ext: mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : mime === 'video/webm' ? 'webm' : 'mp4',
    });
  }
  // 2) Guardar en R2 (si algo falla, se borra lo ya subido)
  const stored: Partial<Record<Kind, string>> = {};
  const keys: string[] = [];
  let bytes = 0;
  try {
    for (const f of ready) {
      const key = `p/${project}/${id}-${f.kind}.${f.ext}`;
      await env.MEDIA.put(key, f.buf, { httpMetadata: { contentType: f.mime } });
      keys.push(key);
      stored[f.kind] = `files/${key}`;
      bytes += f.buf.byteLength;
    }
  } catch (e) {
    if (keys.length) await env.MEDIA.delete(keys);
    throw e;
  }
  const blur =
    typeof meta.blur === 'string' && /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(meta.blur) && meta.blur.length < 4000
      ? meta.blur
      : null;
  const w = Number.isFinite(meta.w) ? Math.round(meta.w!) : null;
  const h = Number.isFinite(meta.h) ? Math.round(meta.h!) : null;
  const pos = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM gallery WHERE project = ?')
    .bind(project)
    .first<{ p: number }>();
  await env.DB.prepare(
    'INSERT INTO gallery (id, project, type, src, thumb, poster, w, h, blur, caption, cover, position, bytes, r2keys, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)',
  )
    .bind(
      id,
      project,
      type,
      stored.full ?? stored.video,
      stored.thumb ?? null,
      stored.poster ?? null,
      w,
      h,
      blur,
      String(meta.caption ?? '').slice(0, 200),
      pos?.p ?? 0,
      bytes,
      JSON.stringify(keys),
      Date.now(),
    )
    .run();
  await audit(env.DB, 'gallery_add', project, { type, caption: meta.caption ?? '' }, ip);
  return json({ ok: true, id });
}

/** Rutas /api/admin/gallery/* (la sesión ya fue verificada). */
export async function galleryAdmin(env: Env, req: Request, path: string, ip: string): Promise<Response> {
  const db = env.DB;

  if (path === '/api/admin/gallery' && req.method === 'GET') {
    const project = new URL(req.url).searchParams.get('project') || '';
    if (!SLUG.test(project) || !(await seed(env, req, project))) return fail(404, 'Proyecto no encontrado');
    return json({ items: (await rows(db, project)).map(toItem) });
  }

  if (path === '/api/admin/gallery/upload' && req.method === 'POST') return upload(env, req, ip);

  if (!sameOrigin(req)) return fail(403, 'Origen no permitido');

  if (path === '/api/admin/gallery/update' && req.method === 'POST') {
    const b = await body<{ project?: string; order?: string[]; items?: { id: string; caption?: string; cover?: boolean }[] }>(req);
    if (!b?.project || !SLUG.test(b.project)) return fail(400, 'Solicitud inválida');
    const current = await rows(db, b.project);
    const ids = new Set(current.map((r) => r.id));
    const stmts: D1PreparedStatement[] = [];
    if (Array.isArray(b.order)) {
      if (b.order.length !== ids.size || !b.order.every((id) => ids.has(id))) return fail(400, 'Orden inválido');
      b.order.forEach((id, i) =>
        stmts.push(db.prepare('UPDATE gallery SET position = ? WHERE id = ? AND project = ?').bind(i, id, b.project)),
      );
    }
    for (const it of b.items ?? []) {
      if (!ID.test(it.id) || !ids.has(it.id)) return fail(400, 'Elemento inválido');
      if (typeof it.caption === 'string')
        stmts.push(
          db.prepare('UPDATE gallery SET caption = ? WHERE id = ? AND project = ?').bind(it.caption.slice(0, 200), it.id, b.project),
        );
      if (it.cover === true) {
        stmts.push(db.prepare('UPDATE gallery SET cover = 0 WHERE project = ?').bind(b.project));
        stmts.push(db.prepare('UPDATE gallery SET cover = 1 WHERE id = ? AND project = ?').bind(it.id, b.project));
      }
    }
    if (stmts.length) await db.batch(stmts);
    await audit(db, 'gallery_update', b.project, { order: !!b.order, items: (b.items ?? []).length }, ip);
    return json({ ok: true, items: (await rows(db, b.project)).map(toItem) });
  }

  if (path === '/api/admin/gallery/delete' && req.method === 'POST') {
    const b = await body<{ project?: string; id?: string }>(req);
    if (!b?.project || !SLUG.test(b.project) || !b.id || !ID.test(b.id)) return fail(400, 'Solicitud inválida');
    const row = await db.prepare('SELECT * FROM gallery WHERE id = ? AND project = ?').bind(b.id, b.project).first<Row>();
    if (!row) return fail(404, 'No encontrado');
    const keys = JSON.parse(row.r2keys || '[]') as string[];
    if (keys.length) await env.MEDIA.delete(keys);
    await db.prepare('DELETE FROM gallery WHERE id = ?').bind(b.id).run();
    await audit(db, 'gallery_delete', b.project, { caption: row.caption }, ip);
    return json({ ok: true });
  }

  return fail(404, 'No encontrado');
}
