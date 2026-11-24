/**
 * Servidor (Cloudflare Worker) del visor.
 * - Redirige www.lotescaribe.cc y la dirección de workers.dev al dominio principal.
 * - Atiende /api/* (datos en vivo de los lotes y el panel de administración), /files/* y /data/projects*.
 * - Lo demás lo entrega a los archivos estáticos (JS, CSS e imágenes se sirven sin pasar por aquí).
 */
import { clearCookie, clientIp, createSession, destroyAllSessions, destroySession, hasSession, isThrottled, recordAttempt } from './auth';
import { hashPassword, newTotpSecret, safeEqual, verifyPassword, verifyTotp } from './crypto';
import { audit, ensureSchema } from './db';
import { galleryAdmin, galleryPublic, gallerySummary, serveFile } from './gallery';
import { body, fail, json, sameOrigin } from './http';
import { createLead, leadsAdmin } from './leads';
import { parseDays, projectStats, track } from './stats';
import { ownerApi, ownersAdmin } from './owners';
import { guardStaticData, loadDetail, lotIds, projectsAdmin, projectsPublic } from './projects';

// Rutas de subida de archivos (multipart): validan su origen por su cuenta
const MULTIPART = new Set(['/api/admin/gallery/upload', '/api/admin/projects/logo']);
const STATUSES = new Set(['available', 'reserved', 'sold']);
const SLUG = /^[a-z0-9-]{1,60}$/;

async function adminRow(db: D1Database) {
  return db
    .prepare('SELECT email, pass, totp, totp_last FROM admin WHERE id = 1')
    .first<{ email: string; pass: string; totp: string; totp_last: number }>();
}

const strongPassword = (p: string) => p.length >= 12 && p.length <= 200 && /[a-zA-Z]/.test(p) && /\d/.test(p);
const validEmail = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);

async function api(req: Request, env: Env, path: string): Promise<Response> {
  const db = env.DB;
  await ensureSchema(db);
  const ip = clientIp(req);
  const method = req.method;

  // ------------------------------------------------------------ público
  if (path === '/api/public/lots' && method === 'GET') {
    const { results } = await db
      .prepare('SELECT project, lot, status, price FROM lot_overrides')
      .all<{ project: string; lot: string; status: string; price: number | null }>();
    const out: Record<string, Record<string, [string, number | null]>> = {};
    for (const r of results) (out[r.project] ??= {})[r.lot] = [r.status, r.price];
    const gallery = await gallerySummary(db);
    // No exponer datos de proyectos ocultos o eliminados
    const { results: hidden } = await db.prepare('SELECT slug FROM projects WHERE visible = 0 OR deleted = 1').all<{ slug: string }>();
    for (const h of hidden) {
      delete out[h.slug];
      delete gallery[h.slug];
    }
    return json({ overrides: out, gallery }, 200, { 'Cache-Control': 'public, max-age=5' });
  }

  const gm = path.match(/^\/api\/public\/gallery\/([a-z0-9-]{1,60})$/);
  if (gm && method === 'GET') {
    if (!(await loadDetail(env, req, gm[1]))) return fail(404, 'No encontrado'); // oculto o inexistente
    return galleryPublic(env, gm[1]);
  }

  if (path === '/api/public/leads' && method === 'POST') return createLead(env, req, ip);
  if (path === '/api/public/track' && method === 'POST') return track(env, req, ip);

  if (path.startsWith('/api/public/project') && method === 'GET') {
    const r = await projectsPublic(env, req, path);
    if (r) return r;
  }

  if (path.startsWith('/api/owner/')) return ownerApi(env, req, path);

  if (!path.startsWith('/api/admin/')) return fail(404, 'No encontrado');

  // Todas las escrituras del panel exigen mismo origen
  // (la subida de archivos es multipart: su origen se valida dentro de galleryAdmin)
  if (method !== 'GET' && !MULTIPART.has(path) && !sameOrigin(req)) return fail(403, 'Origen no permitido');

  // ------------------------------------------------------------ estado de sesión
  if (path === '/api/admin/session' && method === 'GET') {
    const admin = await adminRow(db);
    const authenticated = admin ? await hasSession(db, req) : false;
    return json({ setup: !!admin, authenticated, email: authenticated ? admin!.email : undefined });
  }

  // ------------------------------------------------------------ creación de la cuenta (una sola vez)
  if (path === '/api/admin/setup/start' && method === 'POST') {
    if (await adminRow(db)) return fail(409, 'El panel ya tiene administrador');
    if (await isThrottled(db, ip)) return fail(429, 'Demasiados intentos. Espera unos minutos.');
    const b = await body<{ token?: string }>(req);
    const expected = (env.ADMIN_SETUP_TOKEN || '').trim();
    if (expected.length < 16 || !b?.token || !safeEqual(b.token, expected)) {
      await recordAttempt(db, ip, false);
      return fail(
        401,
        expected.length < 16
          ? 'Falta configurar ADMIN_SETUP_TOKEN en Cloudflare (mínimo 16 caracteres).'
          : 'Código de configuración incorrecto',
      );
    }
    const secret = newTotpSecret();
    const host = new URL(req.url).hostname;
    const otpauth = `otpauth://totp/${encodeURIComponent(`Lotes del Caribe (${host})`)}?secret=${secret}&issuer=${encodeURIComponent('Lotes del Caribe')}&digits=6&period=30`;
    return json({ secret, otpauth });
  }

  if (path === '/api/admin/setup/finish' && method === 'POST') {
    if (await adminRow(db)) return fail(409, 'El panel ya tiene administrador');
    if (await isThrottled(db, ip)) return fail(429, 'Demasiados intentos. Espera unos minutos.');
    const b = await body<{ token?: string; email?: string; password?: string; secret?: string; code?: string }>(req);
    const expected = (env.ADMIN_SETUP_TOKEN || '').trim();
    if (expected.length < 16 || !b?.token || !safeEqual(b.token, expected)) {
      await recordAttempt(db, ip, false);
      return fail(401, 'Código de configuración incorrecto');
    }
    const email = (b.email || '').trim().toLowerCase();
    if (!validEmail(email)) return fail(400, 'Correo no válido');
    if (!strongPassword(b.password || '')) return fail(400, 'La contraseña debe tener al menos 12 caracteres, con letras y números');
    if (!/^[A-Z2-7]{32}$/.test(b.secret || '')) return fail(400, 'Secreto inválido');
    const step = await verifyTotp(b.secret!, b.code || '');
    if (step == null) return fail(400, 'El código de 6 dígitos no coincide. Revisa la hora de tu celular e inténtalo de nuevo.');
    // INSERT con id fijo = 1: si dos personas lo intentan a la vez, solo una puede crear la cuenta
    const res = await db
      .prepare('INSERT OR IGNORE INTO admin (id, email, pass, totp, totp_last, created_at) VALUES (1, ?, ?, ?, ?, ?)')
      .bind(email, await hashPassword(b.password!), b.secret, step, Date.now())
      .run();
    if (!(res.meta as { changes?: number }).changes) return fail(409, 'El panel ya tiene administrador');
    await recordAttempt(db, ip, true);
    await audit(db, 'setup', null, { email }, ip);
    return json({ ok: true }, 200, { 'Set-Cookie': await createSession(db, req) });
  }

  // ------------------------------------------------------------ ingreso
  if (path === '/api/admin/login' && method === 'POST') {
    if (await isThrottled(db, ip)) return fail(429, 'Demasiados intentos fallidos. Espera 15 minutos.');
    const b = await body<{ password?: string; code?: string }>(req);
    const admin = await adminRow(db);
    if (!admin || !b?.password || !b.code) {
      await recordAttempt(db, ip, false);
      return fail(401, 'Datos de ingreso incorrectos');
    }
    const passOk = await verifyPassword(b.password, admin.pass);
    const step = passOk ? await verifyTotp(admin.totp, b.code, admin.totp_last) : null;
    if (!passOk || step == null) {
      await recordAttempt(db, ip, false);
      await audit(db, 'login_failed', null, {}, ip);
      return fail(401, 'Datos de ingreso incorrectos');
    }
    await db.prepare('UPDATE admin SET totp_last = ? WHERE id = 1').bind(step).run();
    await recordAttempt(db, ip, true);
    await audit(db, 'login', null, {}, ip);
    return json({ ok: true }, 200, { 'Set-Cookie': await createSession(db, req) });
  }

  if (path === '/api/admin/logout' && method === 'POST') {
    await destroySession(db, req);
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
  }

  // ------------------------------------------------------------ a partir de aquí: requiere sesión
  if (!(await hasSession(db, req))) return fail(401, 'Sesión vencida. Ingresa de nuevo.');

  if (path === '/api/admin/logout-all' && method === 'POST') {
    await destroyAllSessions(db);
    await audit(db, 'logout_all', null, {}, ip);
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
  }

  if (path === '/api/admin/lots' && method === 'POST') {
    const b = await body<{ project?: string; changes?: { lot: string; status: string; price: number | null }[] }>(req);
    if (!b?.project || !SLUG.test(b.project) || !Array.isArray(b.changes) || b.changes.length === 0 || b.changes.length > 500)
      return fail(400, 'Solicitud inválida');
    const ids = await lotIds(env, req, b.project);
    if (!ids) return fail(404, 'Proyecto no encontrado');
    for (const c of b.changes) {
      if (!ids.has(c.lot)) return fail(400, `El lote ${String(c.lot).slice(0, 20)} no existe`);
      if (!STATUSES.has(c.status)) return fail(400, 'Estado inválido');
      if (c.price != null && (!Number.isFinite(c.price) || c.price < 0 || c.price > 1e13)) return fail(400, 'Precio inválido');
    }
    const now = Date.now();
    await db.batch(
      b.changes.map((c) =>
        db
          .prepare(
            'INSERT INTO lot_overrides (project, lot, status, price, updated_at) VALUES (?, ?, ?, ?, ?) ' +
              'ON CONFLICT (project, lot) DO UPDATE SET status = excluded.status, price = excluded.price, updated_at = excluded.updated_at',
          )
          .bind(b.project, c.lot, c.status, c.price == null ? null : Math.round(c.price), now),
      ),
    );
    await audit(db, 'lots', b.project, b.changes.slice(0, 50), ip);
    return json({ ok: true, updated: b.changes.length });
  }

  if (path === '/api/admin/password' && method === 'POST') {
    if (await isThrottled(db, ip)) return fail(429, 'Demasiados intentos fallidos. Espera 15 minutos.');
    const b = await body<{ current?: string; code?: string; next?: string }>(req);
    const admin = await adminRow(db);
    const passOk = !!admin && !!b?.current && (await verifyPassword(b.current, admin.pass));
    const step = passOk ? await verifyTotp(admin!.totp, String(b?.code ?? '').replace(/\s/g, ''), admin!.totp_last) : null;
    if (!passOk || step == null) {
      await recordAttempt(db, ip, false);
      await audit(db, 'stepup_failed', null, { action: 'password' }, ip);
      return fail(401, 'Contraseña actual o código incorrectos');
    }
    if (!strongPassword(b!.next || '')) return fail(400, 'La nueva contraseña debe tener al menos 12 caracteres, con letras y números');
    if (b!.next === b!.current) return fail(400, 'La nueva contraseña debe ser distinta de la actual');
    await db
      .prepare('UPDATE admin SET pass = ?, totp_last = ? WHERE id = 1')
      .bind(await hashPassword(b!.next!), step)
      .run();
    await destroyAllSessions(db); // cierra todas las demás sesiones
    await audit(db, 'password_change', null, {}, ip);
    return json({ ok: true }, 200, { 'Set-Cookie': await createSession(db, req) });
  }

  if (path.startsWith('/api/admin/gallery')) return galleryAdmin(env, req, path, ip);
  if (path.startsWith('/api/admin/project')) return projectsAdmin(env, req, path, ip);
  if (path.startsWith('/api/admin/leads')) return leadsAdmin(env, req, path, ip);
  if (path.startsWith('/api/admin/owners')) return ownersAdmin(env, req, path, ip);
  if (path === '/api/admin/stats' && method === 'GET') {
    const project = new URL(req.url).searchParams.get('project') || '';
    if (!/^[a-z0-9-]{1,60}$/.test(project)) return fail(400, 'Proyecto inválido');
    return json(await projectStats(db, project, parseDays(req)));
  }

  if (path === '/api/admin/audit' && method === 'GET') {
    const { results } = await db.prepare('SELECT ts, action, project, detail, ip FROM audit ORDER BY id DESC LIMIT 60').all();
    return json({ items: results });
  }

  return fail(404, 'No encontrado');
}

// Dominio principal: www y la dirección de workers.dev redirigen aquí
const MAIN_HOST = 'lotescaribe.cc';
const redirectHost = (h: string) => h === 'www.' + MAIN_HOST || (h.startsWith('visorlotes2026-7.') && h.endsWith('.workers.dev'));

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (redirectHost(url.hostname) && (req.method === 'GET' || req.method === 'HEAD')) {
      url.protocol = 'https:';
      url.hostname = MAIN_HOST;
      url.port = '';
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url.pathname);
      } catch (e) {
        console.error(e);
        return fail(500, 'Error interno');
      }
    }
    if (url.pathname.startsWith('/data/projects')) {
      try {
        await ensureSchema(env.DB);
        return await guardStaticData(env, req, url.pathname);
      } catch (e) {
        console.error(e);
        return env.ASSETS.fetch(req);
      }
    }
    if (url.pathname.startsWith('/files/') && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        return await serveFile(env, req, decodeURIComponent(url.pathname.slice('/files/'.length)));
      } catch (e) {
        console.error(e);
        return new Response('Error', { status: 500 });
      }
    }
    return env.ASSETS.fetch(req);
  },
};
