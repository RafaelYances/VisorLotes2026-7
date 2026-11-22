/**
 * Proyectos gestionados desde el panel.
 * - Proyectos "static": vienen del repositorio (data/projects/<slug>). El panel puede editar
 *   sus datos, reemplazar su plano, ocultarlos o retirarlos.
 * - Proyectos "panel": creados desde el panel (datos en D1, plano procesado en R2).
 * Ocultar/mostrar y eliminar exigen reautenticación (contraseña + código TOTP).
 */
import { isThrottled, recordAttempt } from './auth';
import { verifyPassword, verifyTotp } from './crypto';
import { audit } from './db';
import { fail, json, originOk } from './http';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUS = ['en-venta', 'proximamente', 'vendido'];
const ICONS = ['waves', 'road', 'layers', 'palmtree', 'sun', 'pin'];
const ORDER: Record<string, number> = { 'en-venta': 0, proximamente: 1, vendido: 2 };
const MB = 1024 * 1024;

interface ProjectRow {
  slug: string;
  source: 'static' | 'panel';
  meta: string;
  card: string | null;
  has_plan: number;
  visible: number;
  deleted: number;
  position: number;
}

type Meta = Record<string, unknown> & { name?: string; location?: Record<string, unknown>; logo?: string | null };
type Card = Record<string, unknown> & { slug: string; status?: string; location?: Record<string, unknown> };

const planKey = (slug: string) => `plans/${slug}.json`;

async function rowsBySlug(db: D1Database) {
  const { results } = await db.prepare('SELECT * FROM projects').all<ProjectRow>();
  return new Map(results.map((r) => [r.slug, r]));
}
const getRow = (db: D1Database, slug: string) => db.prepare('SELECT * FROM projects WHERE slug = ?').bind(slug).first<ProjectRow>();

async function staticCards(env: Env, req: Request): Promise<Card[]> {
  const r = await env.ASSETS.fetch(new Request(new URL('/data/projects.json', req.url)));
  return r.ok ? ((await r.json()) as Card[]) : [];
}

async function staticDetail(env: Env, req: Request, slug: string) {
  const r = await env.ASSETS.fetch(new Request(new URL(`/data/projects/${slug}.json`, req.url)));
  if (!r.ok || !(r.headers.get('Content-Type') || '').includes('json')) return null;
  return (await r.json()) as Record<string, unknown>;
}

/** Aplica los datos editados en el panel sobre una tarjeta o ficha. */
function applyMeta<T extends Record<string, unknown>>(base: T, meta: Meta): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(meta)) {
    if (k === 'location') out.location = { ...((base.location as object) ?? {}), ...(v as object) };
    else out[k] = v;
  }
  return out as T;
}

function cardFromRow(row: ProjectRow, base: Card | null): Card | null {
  const meta = JSON.parse(row.meta || '{}') as Meta;
  const plan = row.card ? (JSON.parse(row.card) as Record<string, unknown>) : {};
  const start: Card = base ?? { slug: row.slug, cover: null, media: { photos: 0, videos: 0 }, logo: null, location: {} };
  const merged = applyMeta({ ...start, ...plan }, meta);
  return { ...merged, slug: row.slug, logo: (merged.logo as string) ?? null };
}

/** Lista de proyectos (pública: solo visibles). */
async function listCards(env: Env, req: Request, includeHidden: boolean) {
  const [cards, rows] = await Promise.all([staticCards(env, req), rowsBySlug(env.DB)]);
  const out: (Card & { visible?: boolean; source?: string })[] = [];
  for (const c of cards) {
    const row = rows.get(c.slug);
    if (row?.deleted) continue;
    if (row && !row.visible && !includeHidden) continue;
    const card = row ? cardFromRow(row, c)! : c;
    out.push(includeHidden ? { ...card, visible: row ? !!row.visible : true, source: 'static' } : card);
  }
  for (const row of rows.values()) {
    if (row.source !== 'panel' || row.deleted) continue;
    if (!row.visible && !includeHidden) continue;
    const card = cardFromRow(row, null)!;
    out.push(includeHidden ? { ...card, visible: !!row.visible, source: 'panel' } : card);
  }
  const pos = (s: string) => rows.get(s)?.position ?? 0;
  out.sort((a, b) => (ORDER[a.status ?? ''] ?? 9) - (ORDER[b.status ?? ''] ?? 9) || pos(a.slug) - pos(b.slug));
  return out;
}

/** Ficha completa de un proyecto (plano + datos), o null. */
export async function loadDetail(env: Env, req: Request, slug: string, includeHidden = false) {
  if (!SLUG.test(slug) || slug.length > 60) return null;
  const row = await getRow(env.DB, slug);
  if (row?.deleted) return null;
  if (row && !row.visible && !includeHidden) return null;
  let base: Record<string, unknown> | null = null;
  if (row?.has_plan) {
    const obj = await env.MEDIA.get(planKey(slug));
    if (obj) base = JSON.parse(await new Response(obj.body).text());
  }
  if (!base && (!row || row.source === 'static')) base = await staticDetail(env, req, slug);
  if (!base) return null;
  const detail = row ? applyMeta(base, JSON.parse(row.meta || '{}')) : base;
  return { ...detail, slug, gallery: (detail.gallery as unknown[]) ?? [] } as Record<string, unknown> & {
    slug: string;
    gallery: unknown[];
  };
}

/** Ids de lotes válidos (para validar cambios de estado). */
const lotCache = new Map<string, { at: number; ids: Set<string> }>();
export async function lotIds(env: Env, req: Request, slug: string) {
  const hit = lotCache.get(slug);
  if (hit && Date.now() - hit.at < 60_000) return hit.ids;
  const d = await loadDetail(env, req, slug, true);
  if (!d) return null;
  const ids = new Set(((d.lots as { id: string }[]) ?? []).map((l) => l.id));
  lotCache.set(slug, { at: Date.now(), ids });
  return ids;
}

/** ¿Existe el proyecto (para la galería de proyectos creados en el panel)? */
export async function projectExists(env: Env, req: Request, slug: string) {
  return !!(await loadDetail(env, req, slug, true));
}

// ------------------------------------------------------------------ validación

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** Limpia y valida los datos editables. Devuelve el objeto limpio o un mensaje de error. */
function cleanMeta(input: Record<string, unknown>, slug: string): Meta | string {
  const name = str(input.name, 80);
  if (!name) return 'El nombre es obligatorio';
  const status = STATUS.includes(String(input.status)) ? String(input.status) : 'en-venta';
  const loc = (input.location ?? {}) as Record<string, unknown>;
  const mapsUrl = str(loc.mapsUrl, 500);
  if (mapsUrl && !/^https:\/\/[^\s"'<>]+$/.test(mapsUrl)) return 'El enlace de Google Maps debe empezar por https://';
  const lat = loc.lat === '' || loc.lat == null ? null : num(loc.lat, -90, 90);
  const lng = loc.lng === '' || loc.lng == null ? null : num(loc.lng, -180, 180);
  if ((loc.lat !== '' && loc.lat != null && lat == null) || (loc.lng !== '' && loc.lng != null && lng == null))
    return 'Coordenadas inválidas';
  const contact = (input.contact ?? {}) as Record<string, unknown>;
  const whatsapp = String(contact.whatsapp ?? '').replace(/\D/g, '');
  if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15))
    return 'WhatsApp inválido (usa el formato internacional, ej: 573001234567)';
  const sb = (input.setbacks ?? {}) as Record<string, unknown>;
  const highlights = Array.isArray(input.highlights)
    ? input.highlights
        .slice(0, 6)
        .map((h: Record<string, unknown>) => ({
          icon: ICONS.includes(String(h?.icon)) ? String(h.icon) : 'pin',
          title: str(h?.title, 60),
          text: str(h?.text, 140),
        }))
        .filter((h) => h.title)
    : [];
  const logo = input.logo == null || input.logo === '' ? null : String(input.logo);
  if (logo && !new RegExp(`^(img/[a-z0-9._-]{1,80}|files/p/${slug}/[a-f0-9-]{36}-logo\\.(webp|jpg|png))$`).test(logo))
    return 'Logo inválido';
  const location: Record<string, unknown> = { city: str(loc.city, 80), region: str(loc.region, 80), mapsUrl: mapsUrl || undefined };
  if (lat != null) location.lat = lat;
  if (lng != null) location.lng = lng;
  return {
    name,
    tagline: str(input.tagline, 140),
    description: str(input.description, 1200),
    status,
    location,
    contact: { whatsapp: whatsapp || '', phoneLabel: str(contact.phoneLabel, 40) },
    currency: input.currency === 'USD' ? 'USD' : 'COP',
    highlights,
    setbacks: { front: num(sb.front, 0, 30) ?? 3, back: num(sb.back, 0, 30) ?? 3, side: num(sb.side, 0, 30) ?? 1.5 },
    logo,
  };
}

/** Validación básica del plano procesado en el navegador. */
function validPlan(p: Record<string, unknown>) {
  const lots = p.lots as Record<string, unknown>[];
  if (!Array.isArray(lots) || lots.length === 0 || lots.length > 5000) return 'El plano no tiene lotes';
  for (const l of lots) {
    if (typeof l.id !== 'string' || !/^[A-Z0-9]{1,10}-[A-Z0-9]{1,10}$/.test(l.id)) return 'Identificador de lote inválido';
    if (!Array.isArray(l.coords) || !Array.isArray(l.local) || !Number.isFinite(l.area as number)) return 'Lote con geometría inválida';
    if (!['available', 'reserved', 'sold'].includes(l.status as string)) return 'Estado de lote inválido';
  }
  for (const k of ['bounds', 'manzanas', 'roads', 'greens', 'labels', 'pois']) if (!Array.isArray(p[k])) return `Falta "${k}" en el plano`;
  for (const l of p.labels as { text?: unknown }[])
    if (typeof l.text !== 'string' || l.text.length > 120 || /[<>]/.test(l.text)) return 'Rótulo inválido';
  for (const poi of p.pois as { name?: unknown; lng?: unknown; lat?: unknown; minutes?: unknown }[]) {
    if (typeof poi.name !== 'string' || poi.name.length > 80 || /[<>]/.test(poi.name)) return 'Punto de interés inválido';
    if (!Number.isFinite(poi.lng as number) || !Number.isFinite(poi.lat as number)) return 'Punto de interés inválido';
    if (poi.minutes != null && !Number.isFinite(poi.minutes as number)) return 'Punto de interés inválido';
  }
  for (const l of lots) {
    for (const k of ['manzana', 'numero'] as const)
      if (typeof l[k] !== 'string' || !/^[A-Za-z0-9]{1,10}$/.test(l[k] as string)) return 'Lote inválido';
    if (
      !Array.isArray(l.sides) ||
      (l.sides as { colinda?: unknown }[]).some((sd) => typeof sd.colinda !== 'string' || sd.colinda.length > 60 || /[<>]/.test(sd.colinda))
    )
      return 'Lote inválido';
  }
  return null;
}

// ------------------------------------------------------------------ reautenticación

async function stepUp(env: Env, ip: string, password: unknown, code: unknown) {
  if (await isThrottled(env.DB, ip)) return 'Demasiados intentos fallidos. Espera 15 minutos.';
  const admin = await env.DB.prepare('SELECT pass, totp, totp_last FROM admin WHERE id = 1').first<{
    pass: string;
    totp: string;
    totp_last: number;
  }>();
  const ok = admin && typeof password === 'string' && (await verifyPassword(password, admin.pass));
  const step = ok ? await verifyTotp(admin!.totp, String(code ?? '').replace(/\s/g, ''), admin!.totp_last) : null;
  if (!ok || step == null) {
    await recordAttempt(env.DB, ip, false);
    await audit(env.DB, 'stepup_failed', null, {}, ip);
    return 'Contraseña o código incorrectos';
  }
  await env.DB.prepare('UPDATE admin SET totp_last = ? WHERE id = 1').bind(step).run();
  return null;
}

// ------------------------------------------------------------------ rutas

export async function projectsPublic(env: Env, req: Request, path: string) {
  if (path === '/api/public/projects')
    return json({ projects: await listCards(env, req, false) }, 200, { 'Cache-Control': 'public, max-age=5' });
  const m = path.match(/^\/api\/public\/project\/([a-z0-9-]{1,60})$/);
  if (m) {
    const d = await loadDetail(env, req, m[1]);
    return d ? json(d, 200, { 'Cache-Control': 'public, max-age=5' }) : fail(404, 'Proyecto no encontrado');
  }
  return null;
}

async function readJson(req: Request, maxBytes: number) {
  if (Number(req.headers.get('Content-Length') || 0) > maxBytes) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sniffLogo(buf: ArrayBuffer) {
  const b = new Uint8Array(buf.slice(0, 12));
  const a = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
  if (a(0, 4) === 'RIFF' && a(8, 4) === 'WEBP') return ['image/webp', 'webp'] as const;
  if (b[0] === 0x89 && a(1, 3) === 'PNG') return ['image/png', 'png'] as const;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['image/jpeg', 'jpg'] as const;
  return null;
}

/** Rutas /api/admin/projects* (la sesión ya fue verificada). */
export async function projectsAdmin(env: Env, req: Request, path: string, ip: string): Promise<Response> {
  const db = env.DB;
  const method = req.method;

  if (path === '/api/admin/projects' && method === 'GET') return json({ projects: await listCards(env, req, true) });

  const dm = path.match(/^\/api\/admin\/project\/([a-z0-9-]{1,60})$/);
  if (dm && method === 'GET') {
    const d = await loadDetail(env, req, dm[1], true);
    if (!d) return fail(404, 'Proyecto no encontrado');
    const row = await getRow(db, dm[1]);
    return json({ ...d, _admin: { source: row?.source ?? 'static', visible: row ? !!row.visible : true, hasPlan: !!row?.has_plan } });
  }

  // Logo (multipart)
  if (path === '/api/admin/projects/logo' && method === 'POST') {
    if (!originOk(req) || !(req.headers.get('Content-Type') || '').startsWith('multipart/form-data'))
      return fail(403, 'Origen no permitido');
    if (Number(req.headers.get('Content-Length') || 0) > 3 * MB) return fail(413, 'El logo es demasiado grande (máx. 2 MB)');
    const form = await req.formData();
    const slug = String(form.get('slug') || '');
    const file = form.get('logo');
    if (!SLUG.test(slug) || !(file instanceof File)) return fail(400, 'Solicitud inválida');
    if (file.size > 2 * MB) return fail(413, 'El logo es demasiado grande (máx. 2 MB)');
    const buf = await file.arrayBuffer();
    const t = sniffLogo(buf);
    if (!t) return fail(415, 'Formato no permitido (usa PNG, WebP o JPG)');
    const key = `p/${slug}/${crypto.randomUUID()}-logo.${t[1]}`;
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: t[0] } });
    return json({ ok: true, src: `files/${key}` });
  }

  if (method !== 'POST') return fail(404, 'No encontrado');

  // Crear / editar (datos y, opcionalmente, plano procesado)
  if (path === '/api/admin/projects/save') {
    const b = await readJson(req, 12 * MB);
    if (!b) return fail(413, 'El plano es demasiado grande o la solicitud es inválida');
    const slug = String(b.slug || '');
    if (!SLUG.test(slug) || slug.length < 3 || slug.length > 60)
      return fail(400, 'Identificador inválido (usa minúsculas, números y guiones)');
    const meta = cleanMeta((b.meta ?? {}) as Record<string, unknown>, slug);
    if (typeof meta === 'string') return fail(400, meta);
    const plan = b.plan as Record<string, unknown> | undefined;
    if (plan) {
      const err = validPlan(plan);
      if (err) return fail(400, err);
    }
    let row = await getRow(db, slug);
    const isStatic = (await staticCards(env, req)).some((c) => c.slug === slug);
    if (b.create) {
      if (row || isStatic) return fail(409, 'Ya existe un proyecto con ese identificador');
      if (!plan) return fail(400, 'Sube el plano DXF del proyecto');
    } else if (!row && !isStatic) return fail(404, 'Proyecto no encontrado');
    if (row?.deleted) return fail(409, 'Este proyecto fue eliminado');

    // Si cambia el logo, borrar el anterior de R2
    const oldLogo = row ? (JSON.parse(row.meta || '{}') as Meta).logo : null;
    const now = Date.now();
    if (plan) {
      const stored = { ...plan, gallery: [] };
      await env.MEDIA.put(planKey(slug), JSON.stringify(stored), { httpMetadata: { contentType: 'application/json' } });
      lotCache.delete(slug);
    }
    const card = plan
      ? JSON.stringify({ preview: b.preview, stats: plan.stats, bounds: plan.bounds, location: plan.location })
      : (row?.card ?? null);
    if (!row) {
      const pos = await db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM projects').first<{ p: number }>();
      await db
        .prepare(
          'INSERT INTO projects (slug, source, meta, card, has_plan, visible, deleted, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
        )
        .bind(slug, b.create ? 'panel' : 'static', JSON.stringify(meta), card, plan ? 1 : 0, b.create ? 0 : 1, pos?.p ?? 0, now, now)
        .run();
    } else {
      await db
        .prepare('UPDATE projects SET meta = ?, card = ?, has_plan = MAX(has_plan, ?), updated_at = ? WHERE slug = ?')
        .bind(JSON.stringify(meta), card, plan ? 1 : 0, now, slug)
        .run();
    }
    if (oldLogo && oldLogo !== meta.logo && oldLogo.startsWith('files/')) await env.MEDIA.delete(oldLogo.slice('files/'.length));
    row = await getRow(db, slug);
    await audit(db, b.create ? 'project_create' : plan ? 'project_plan' : 'project_edit', slug, { name: meta.name }, ip);
    return json({ ok: true, visible: !!row?.visible });
  }

  // Ocultar / mostrar (con reautenticación)
  if (path === '/api/admin/projects/visibility') {
    const b = await readJson(req, 10_000);
    const slug = String(b?.slug || '');
    if (!b || !SLUG.test(slug)) return fail(400, 'Solicitud inválida');
    const err = await stepUp(env, ip, b.password, b.code);
    if (err) return fail(401, err);
    const isStatic = (await staticCards(env, req)).some((c) => c.slug === slug);
    const row = await getRow(db, slug);
    if (!row && !isStatic) return fail(404, 'Proyecto no encontrado');
    const visible = b.visible ? 1 : 0;
    if (!row) {
      await db
        .prepare(
          "INSERT INTO projects (slug, source, meta, visible, deleted, position, created_at, updated_at) VALUES (?, 'static', '{}', ?, 0, 0, ?, ?)",
        )
        .bind(slug, visible, Date.now(), Date.now())
        .run();
    } else await db.prepare('UPDATE projects SET visible = ?, updated_at = ? WHERE slug = ?').bind(visible, Date.now(), slug).run();
    await audit(db, visible ? 'project_show' : 'project_hide', slug, {}, ip);
    return json({ ok: true, visible: !!visible });
  }

  // Eliminar (con reautenticación + nombre escrito)
  if (path === '/api/admin/projects/delete') {
    const b = await readJson(req, 10_000);
    const slug = String(b?.slug || '');
    if (!b || !SLUG.test(slug)) return fail(400, 'Solicitud inválida');
    const detail = await loadDetail(env, req, slug, true);
    if (!detail) return fail(404, 'Proyecto no encontrado');
    const name = String(detail.name ?? '');
    if (
      String(b.confirmName ?? '')
        .trim()
        .toLowerCase() !== name.trim().toLowerCase()
    )
      return fail(400, 'El nombre escrito no coincide con el del proyecto');
    const err = await stepUp(env, ip, b.password, b.code);
    if (err) return fail(401, err);

    // Borrar TODOS los archivos del proyecto en R2 (galería, logos —guardados o no— y plano)
    const row = await getRow(db, slug);
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await env.MEDIA.list({ prefix: `p/${slug}/`, cursor, limit: 1000 });
      keys.push(...page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    if (row?.has_plan) keys.push(planKey(slug));
    for (let i = 0; i < keys.length; i += 900) await env.MEDIA.delete(keys.slice(i, i + 900));

    const stmts = [
      db.prepare('DELETE FROM gallery WHERE project = ?').bind(slug),
      db.prepare('DELETE FROM lot_overrides WHERE project = ?').bind(slug),
      db.prepare('DELETE FROM project_flags WHERE project = ?').bind(slug),
    ];
    if (row?.source === 'panel') stmts.push(db.prepare('DELETE FROM projects WHERE slug = ?').bind(slug));
    else if (row)
      stmts.push(
        db
          .prepare("UPDATE projects SET deleted = 1, visible = 0, has_plan = 0, card = NULL, meta = '{}', updated_at = ? WHERE slug = ?")
          .bind(Date.now(), slug),
      );
    else
      stmts.push(
        db
          .prepare(
            "INSERT INTO projects (slug, source, meta, visible, deleted, position, created_at, updated_at) VALUES (?, 'static', '{}', 0, 1, 0, ?, ?)",
          )
          .bind(slug, Date.now(), Date.now()),
      );
    await db.batch(stmts);
    lotCache.delete(slug);
    await audit(db, 'project_delete', slug, { name }, ip);
    return json({ ok: true });
  }

  return fail(404, 'No encontrado');
}

/**
 * Archivos de datos publicados del repositorio (/data/projects*): se ocultan los
 * proyectos ocultos o eliminados desde el panel.
 */
export async function guardStaticData(env: Env, req: Request, path: string) {
  if (path === '/data/projects.json') {
    const [cards, rows] = await Promise.all([staticCards(env, req), rowsBySlug(env.DB)]);
    const visible = cards.filter((c) => {
      const r = rows.get(c.slug);
      return !r || (r.visible && !r.deleted);
    });
    return json(visible, 200, { 'Cache-Control': 'public, max-age=30' });
  }
  const m = path.match(/^\/data\/projects\/([a-z0-9-]{1,60})\.json$/);
  if (m) {
    const row = await getRow(env.DB, m[1]);
    if (row && (row.deleted || !row.visible)) return fail(404, 'No encontrado');
  }
  return env.ASSETS.fetch(req);
}
