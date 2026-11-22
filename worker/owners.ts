/**
 * Portal de dueños de proyecto (/dueno).
 * Un dueño SOLO puede cambiar el estado (disponible / reservado / vendido) de los lotes
 * de los proyectos que el administrador le asignó mediante un enlace de invitación.
 * Cuenta propia con contraseña + código TOTP, sesión y cookie separadas del administrador.
 */
import { clientIp, isThrottled, readCookie, recordAttempt } from './auth';
import { hashPassword, newTotpSecret, randomToken, sha256, verifyPassword, verifyTotp } from './crypto';
import { audit } from './db';
import { body, fail, json, sameOrigin } from './http';
import { loadDetail } from './projects';

const COOKIE = '__Host-vl_owner';
const SESSION_HOURS = 12;
const INVITE_DAYS = 7;
const SLUG = /^[a-z0-9-]{1,60}$/;
const STATUSES = new Set(['available', 'reserved', 'sold']);
// Hash ficticio para que un correo inexistente tarde lo mismo que uno real (no revela qué correos existen)
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

interface Owner {
  id: string;
  email: string;
  name: string;
  pass: string;
  totp: string;
  totp_last: number;
}

const validEmail = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
const strongPassword = (p: string) => p.length >= 10 && p.length <= 200 && /[a-zA-Z]/.test(p) && /\d/.test(p);
const throttleKey = (ip: string) => `owner:${ip}`;

// ------------------------------------------------------------------ sesiones

async function createOwnerSession(db: D1Database, req: Request, ownerId: string) {
  const token = randomToken(32);
  const now = Date.now();
  await db.batch([
    db
      .prepare('INSERT INTO owner_sessions (token_hash, owner_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256(token), ownerId, now, now + SESSION_HOURS * 3600_000, clientIp(req)),
    db.prepare('DELETE FROM owner_sessions WHERE expires_at < ?').bind(now),
    db.prepare('UPDATE owners SET last_login = ? WHERE id = ?').bind(now, ownerId),
  ]);
  return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}
const clearCookie = `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;

async function sessionOwner(db: D1Database, req: Request) {
  const token = readCookie(req, COOKIE);
  if (!token || token.length < 20) return null;
  return db
    .prepare(
      'SELECT o.id, o.email, o.name FROM owner_sessions s JOIN owners o ON o.id = s.owner_id WHERE s.token_hash = ? AND s.expires_at > ?',
    )
    .bind(await sha256(token), Date.now())
    .first<{ id: string; email: string; name: string }>();
}

async function ownerProjects(db: D1Database, ownerId: string) {
  const { results } = await db.prepare('SELECT project FROM owner_projects WHERE owner_id = ?').bind(ownerId).all<{ project: string }>();
  return results.map((r) => r.project);
}

async function findInvite(db: D1Database, token: unknown) {
  if (typeof token !== 'string' || token.length < 30 || token.length > 100) return null;
  const inv = await db
    .prepare('SELECT id, project, expires_at, used_at FROM owner_invites WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ id: string; project: string; expires_at: number; used_at: number | null }>();
  if (!inv || inv.used_at || inv.expires_at < Date.now()) return null;
  return inv;
}

// ------------------------------------------------------------------ rutas del dueño

export async function ownerApi(env: Env, req: Request, path: string): Promise<Response> {
  const db = env.DB;
  const ip = clientIp(req);
  if (req.method !== 'GET' && !sameOrigin(req)) return fail(403, 'Origen no permitido');

  if (path === '/api/owner/session' && req.method === 'GET') {
    const o = await sessionOwner(db, req);
    return json({ authenticated: !!o, email: o?.email, name: o?.name });
  }

  // --- Invitación: revisar, iniciar y aceptar
  if (path === '/api/owner/invite/check' && req.method === 'POST') {
    if (await isThrottled(db, throttleKey(ip))) return fail(429, 'Demasiados intentos. Espera 15 minutos.');
    const b = await body<{ token?: string }>(req);
    const inv = await findInvite(db, b?.token);
    if (!inv) {
      await recordAttempt(db, throttleKey(ip), false);
      return fail(404, 'Este enlace no es válido, ya se usó o venció. Pide uno nuevo al administrador.');
    }
    const d = await loadDetail(env, req, inv.project, true);
    return json({ project: (d?.name as string) ?? inv.project, expires: inv.expires_at });
  }

  if (path === '/api/owner/invite/start' && req.method === 'POST') {
    const b = await body<{ token?: string }>(req);
    if (!(await findInvite(db, b?.token))) return fail(404, 'Enlace no válido');
    const secret = newTotpSecret();
    const host = new URL(req.url).hostname;
    const otpauth = `otpauth://totp/${encodeURIComponent(`Lotes del Caribe - Dueño (${host})`)}?secret=${secret}&issuer=${encodeURIComponent('Lotes del Caribe')}&digits=6&period=30`;
    return json({ secret, otpauth });
  }

  if (path === '/api/owner/invite/accept' && req.method === 'POST') {
    if (await isThrottled(db, throttleKey(ip))) return fail(429, 'Demasiados intentos. Espera 15 minutos.');
    const b = await body<{
      token?: string;
      mode?: string;
      name?: string;
      email?: string;
      password?: string;
      secret?: string;
      code?: string;
    }>(req);
    const inv = await findInvite(db, b?.token);
    if (!b || !inv) return fail(404, 'Este enlace no es válido, ya se usó o venció.');
    const email = String(b.email ?? '')
      .trim()
      .toLowerCase();
    if (!validEmail(email)) return fail(400, 'Correo no válido');
    const code = String(b.code ?? '').replace(/\s/g, '');
    let ownerId: string;

    if (b.mode === 'existing') {
      // Ya tiene cuenta: debe demostrarlo con contraseña + código
      const o = await db.prepare('SELECT * FROM owners WHERE email = ?').bind(email).first<Owner>();
      const passOk = await verifyPassword(String(b.password ?? ''), o?.pass ?? DUMMY_HASH);
      const step = o && passOk ? await verifyTotp(o.totp, code, o.totp_last) : null;
      if (!o || !passOk || step == null) {
        await recordAttempt(db, throttleKey(ip), false);
        return fail(401, 'Correo, contraseña o código incorrectos');
      }
      await db.prepare('UPDATE owners SET totp_last = ? WHERE id = ?').bind(step, o.id).run();
      ownerId = o.id;
    } else {
      if (await db.prepare('SELECT 1 FROM owners WHERE email = ?').bind(email).first())
        return fail(409, 'Ya existe una cuenta con ese correo. Elige "Ya tengo cuenta".');
      const name = String(b.name ?? '')
        .trim()
        .slice(0, 80);
      if (!name) return fail(400, 'Escribe tu nombre');
      if (!strongPassword(String(b.password ?? '')))
        return fail(400, 'La contraseña debe tener al menos 10 caracteres, con letras y números');
      if (!/^[A-Z2-7]{32}$/.test(String(b.secret ?? ''))) return fail(400, 'Datos inválidos');
      const step = await verifyTotp(b.secret!, code);
      if (step == null) return fail(400, 'El código de 6 dígitos no coincide. Revisa la hora de tu celular e inténtalo de nuevo.');
      ownerId = crypto.randomUUID();
      await db
        .prepare('INSERT INTO owners (id, email, name, pass, totp, totp_last, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(ownerId, email, name, await hashPassword(b.password!), b.secret, step, Date.now())
        .run();
    }
    // Marcar la invitación como usada (solo si nadie la usó en paralelo)
    const used = await db
      .prepare('UPDATE owner_invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL')
      .bind(Date.now(), ownerId, inv.id)
      .run();
    if (!(used.meta as { changes?: number }).changes) return fail(409, 'Este enlace ya se usó');
    await db
      .prepare('INSERT OR IGNORE INTO owner_projects (owner_id, project, created_at) VALUES (?, ?, ?)')
      .bind(ownerId, inv.project, Date.now())
      .run();
    await recordAttempt(db, throttleKey(ip), true);
    await audit(db, 'owner_joined', inv.project, { by: email }, ip);
    return json({ ok: true }, 200, { 'Set-Cookie': await createOwnerSession(db, req, ownerId) });
  }

  // --- Ingreso
  if (path === '/api/owner/login' && req.method === 'POST') {
    if (await isThrottled(db, throttleKey(ip))) return fail(429, 'Demasiados intentos fallidos. Espera 15 minutos.');
    const b = await body<{ email?: string; password?: string; code?: string }>(req);
    const email = String(b?.email ?? '')
      .trim()
      .toLowerCase();
    const o = validEmail(email) ? await db.prepare('SELECT * FROM owners WHERE email = ?').bind(email).first<Owner>() : null;
    const passOk = await verifyPassword(String(b?.password ?? ''), o?.pass ?? DUMMY_HASH);
    const step = o && passOk ? await verifyTotp(o.totp, String(b?.code ?? '').replace(/\s/g, ''), o.totp_last) : null;
    if (!o || !passOk || step == null || (await ownerProjects(db, o.id)).length === 0) {
      await recordAttempt(db, throttleKey(ip), false);
      return fail(401, 'Correo, contraseña o código incorrectos');
    }
    await db.prepare('UPDATE owners SET totp_last = ? WHERE id = ?').bind(step, o.id).run();
    await recordAttempt(db, throttleKey(ip), true);
    return json({ ok: true }, 200, { 'Set-Cookie': await createOwnerSession(db, req, o.id) });
  }

  if (path === '/api/owner/logout' && req.method === 'POST') {
    const token = readCookie(req, COOKIE);
    if (token)
      await db
        .prepare('DELETE FROM owner_sessions WHERE token_hash = ?')
        .bind(await sha256(token))
        .run();
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
  }

  // --- A partir de aquí: requiere sesión de dueño
  const owner = await sessionOwner(db, req);
  if (!owner) return fail(401, 'Sesión vencida. Ingresa de nuevo.');
  const mine = await ownerProjects(db, owner.id);

  if (path === '/api/owner/projects' && req.method === 'GET') {
    const items = [];
    for (const slug of mine) {
      const d = await loadDetail(env, req, slug, true);
      if (d) items.push({ slug, name: d.name });
    }
    return json({ projects: items });
  }

  const pm = path.match(/^\/api\/owner\/project\/([a-z0-9-]{1,60})$/);
  if (pm && req.method === 'GET') {
    if (!mine.includes(pm[1])) return fail(404, 'Proyecto no encontrado');
    const d = await loadDetail(env, req, pm[1], true);
    if (!d) return fail(404, 'Proyecto no encontrado');
    const { results } = await db
      .prepare('SELECT lot, status FROM lot_overrides WHERE project = ?')
      .bind(pm[1])
      .all<{ lot: string; status: string }>();
    const o = new Map(results.map((r) => [r.lot, r.status]));
    const lots = ((d.lots as Record<string, unknown>[]) ?? []).map((l) => ({ ...l, status: o.get(l.id as string) ?? l.status }));
    // Solo lo necesario para ver el mapa y los lotes
    return json({ ...d, lots, gallery: [], description: '' });
  }

  if (path === '/api/owner/lots' && req.method === 'POST') {
    const b = await body<{ project?: string; changes?: { lot: string; status: string }[] }>(req);
    if (!b?.project || !SLUG.test(b.project) || !Array.isArray(b.changes) || !b.changes.length || b.changes.length > 500)
      return fail(400, 'Solicitud inválida');
    if (!mine.includes(b.project)) return fail(403, 'No tienes acceso a este proyecto');
    const d = await loadDetail(env, req, b.project, true);
    if (!d) return fail(404, 'Proyecto no encontrado');
    const base = new Map(((d.lots as { id: string; price: number | null }[]) ?? []).map((l) => [l.id, l.price]));
    for (const c of b.changes) {
      if (!base.has(c.lot)) return fail(400, 'Lote inválido');
      if (!STATUSES.has(c.status)) return fail(400, 'Estado inválido');
    }
    const now = Date.now();
    // Solo cambia el ESTADO; el precio se conserva (o se toma el del plano si no había cambios)
    await db.batch(
      b.changes.map((c) =>
        db
          .prepare(
            'INSERT INTO lot_overrides (project, lot, status, price, updated_at) VALUES (?, ?, ?, ?, ?) ' +
              'ON CONFLICT (project, lot) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at',
          )
          .bind(b.project, c.lot, c.status, base.get(c.lot) ?? null, now),
      ),
    );
    await audit(db, 'owner_lots', b.project, { by: owner.email, changes: b.changes.slice(0, 50) }, ip);
    return json({ ok: true });
  }

  if (path === '/api/owner/password' && req.method === 'POST') {
    if (await isThrottled(db, throttleKey(ip))) return fail(429, 'Demasiados intentos fallidos. Espera 15 minutos.');
    const b = await body<{ current?: string; code?: string; next?: string }>(req);
    const o = await db.prepare('SELECT * FROM owners WHERE id = ?').bind(owner.id).first<Owner>();
    const passOk = !!o && (await verifyPassword(String(b?.current ?? ''), o.pass));
    const step = passOk ? await verifyTotp(o!.totp, String(b?.code ?? '').replace(/\s/g, ''), o!.totp_last) : null;
    if (!passOk || step == null) {
      await recordAttempt(db, throttleKey(ip), false);
      return fail(401, 'Contraseña actual o código incorrectos');
    }
    if (!strongPassword(String(b?.next ?? '')))
      return fail(400, 'La nueva contraseña debe tener al menos 10 caracteres, con letras y números');
    await db.batch([
      db.prepare('UPDATE owners SET pass = ?, totp_last = ? WHERE id = ?').bind(await hashPassword(b!.next!), step, owner.id),
      db.prepare('DELETE FROM owner_sessions WHERE owner_id = ?').bind(owner.id),
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': await createOwnerSession(db, req, owner.id) });
  }

  return fail(404, 'No encontrado');
}

// ------------------------------------------------------------------ rutas del administrador

export async function ownersAdmin(env: Env, req: Request, path: string, ip: string): Promise<Response> {
  const db = env.DB;

  if (path === '/api/admin/owners' && req.method === 'GET') {
    const project = new URL(req.url).searchParams.get('project') || '';
    if (!SLUG.test(project)) return fail(400, 'Proyecto inválido');
    const { results: owners } = await db
      .prepare(
        'SELECT o.id, o.email, o.name, o.last_login, op.created_at AS since FROM owner_projects op JOIN owners o ON o.id = op.owner_id WHERE op.project = ? ORDER BY op.created_at',
      )
      .bind(project)
      .all();
    const { results: invites } = await db
      .prepare(
        'SELECT id, created_at, expires_at FROM owner_invites WHERE project = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC',
      )
      .bind(project, Date.now())
      .all();
    return json({ owners, invites });
  }

  if (req.method !== 'POST') return fail(404, 'No encontrado');

  if (path === '/api/admin/owners/invite') {
    const b = await body<{ project?: string }>(req);
    if (!b?.project || !SLUG.test(b.project) || !(await loadDetail(env, req, b.project, true))) return fail(404, 'Proyecto no encontrado');
    const token = randomToken(32);
    const now = Date.now();
    const expires = now + INVITE_DAYS * 86400_000;
    await db.batch([
      db
        .prepare('INSERT INTO owner_invites (id, token_hash, project, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), await sha256(token), b.project, now, expires),
      db.prepare('DELETE FROM owner_invites WHERE expires_at < ?').bind(now - 30 * 86400_000),
    ]);
    await audit(db, 'owner_invite', b.project, {}, ip);
    // El enlace solo se muestra esta vez: en la base de datos se guarda su huella (hash)
    return json({ ok: true, link: `${new URL(req.url).origin}/dueno/invitacion#${token}`, expires });
  }

  if (path === '/api/admin/owners/cancel-invite') {
    const b = await body<{ id?: string }>(req);
    if (!b?.id || !/^[a-f0-9-]{36}$/.test(b.id)) return fail(400, 'Solicitud inválida');
    await db.prepare('DELETE FROM owner_invites WHERE id = ? AND used_at IS NULL').bind(b.id).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/owners/revoke') {
    const b = await body<{ ownerId?: string; project?: string }>(req);
    if (!b?.ownerId || !/^[a-f0-9-]{36}$/.test(b.ownerId) || !b.project || !SLUG.test(b.project)) return fail(400, 'Solicitud inválida');
    const o = await db.prepare('SELECT email FROM owners WHERE id = ?').bind(b.ownerId).first<{ email: string }>();
    await db.prepare('DELETE FROM owner_projects WHERE owner_id = ? AND project = ?').bind(b.ownerId, b.project).run();
    // Si ya no tiene proyectos, se elimina la cuenta y sus sesiones
    const left = await db.prepare('SELECT COUNT(*) AS n FROM owner_projects WHERE owner_id = ?').bind(b.ownerId).first<{ n: number }>();
    if (!left?.n)
      await db.batch([
        db.prepare('DELETE FROM owner_sessions WHERE owner_id = ?').bind(b.ownerId),
        db.prepare('DELETE FROM owners WHERE id = ?').bind(b.ownerId),
      ]);
    await audit(db, 'owner_revoke', b.project, { by: o?.email ?? '' }, ip);
    return json({ ok: true });
  }

  return fail(404, 'No encontrado');
}
