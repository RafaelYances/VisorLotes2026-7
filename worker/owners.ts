/**
 * Portal de dueños de proyecto (/dueno).
 * El administrador crea el acceso (usuario + contraseña generada) y puede volver a verla.
 * Un dueño SOLO puede cambiar el estado (disponible / reservado / vendido) de los lotes
 * de los proyectos asignados. Sesión y cookie separadas del administrador.
 *
 * Contraseñas: se guarda un hash (PBKDF2) para validar el ingreso y una copia cifrada
 * (AES-GCM) para que el administrador pueda consultarla desde el panel.
 */
import { clientIp, isThrottled, readCookie, recordAttempt } from './auth';
import { b64, hashPassword, randomBytes, randomToken, sha256, unb64, verifyPassword } from './crypto';
import { audit } from './db';
import { body, fail, json, sameOrigin } from './http';
import { loadDetail } from './projects';

const COOKIE = '__Host-vl_owner';
const SESSION_HOURS = 12;
const SLUG = /^[a-z0-9-]{1,60}$/;
const ID = /^[a-f0-9-]{36}$/;
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const STATUSES = new Set(['available', 'reserved', 'sold']);
// Hash ficticio: un usuario inexistente tarda lo mismo que uno real (no revela qué usuarios existen)
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

interface Account {
  id: string;
  username: string;
  name: string;
  pass_hash: string;
  pass_enc: string;
}

const ipKey = (ip: string) => `owner-ip:${ip}`;
const userKey = (u: string) => `owner-user:${u}`;

// ------------------------------------------------------------------ contraseñas

/** Contraseña aleatoria legible: 12 caracteres sin letras confusas (ej. k7Pm-4xQa-9tRw). */
function generatePassword() {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  const chars = [...bytes].map((x) => A[x % A.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Llave de cifrado (se genera una sola vez y queda en la base de datos). */
let keyPromise: Promise<CryptoKey> | null = null;
function cryptoKey(db: D1Database) {
  keyPromise ??= (async () => {
    let row = await db.prepare("SELECT value FROM app_keys WHERE name = 'owner_pass'").first<{ value: string }>();
    if (!row) {
      await db
        .prepare("INSERT OR IGNORE INTO app_keys (name, value) VALUES ('owner_pass', ?)")
        .bind(b64(randomBytes(32)))
        .run();
      row = await db.prepare("SELECT value FROM app_keys WHERE name = 'owner_pass'").first<{ value: string }>();
    }
    return crypto.subtle.importKey('raw', unb64(row!.value), 'AES-GCM', false, ['encrypt', 'decrypt']);
  })().catch((e) => {
    keyPromise = null;
    throw e;
  });
  return keyPromise;
}

async function encrypt(db: D1Database, text: string) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(db), new TextEncoder().encode(text));
  return `${b64(iv)}.${b64(data)}`;
}

async function decrypt(db: D1Database, enc: string) {
  const [iv, data] = enc.split('.');
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await cryptoKey(db), unb64(data));
  return new TextDecoder().decode(out);
}

// ------------------------------------------------------------------ sesiones

async function createOwnerSession(db: D1Database, req: Request, ownerId: string) {
  const token = randomToken(32);
  const now = Date.now();
  await db.batch([
    db
      .prepare('INSERT INTO owner_sessions (token_hash, owner_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256(token), ownerId, now, now + SESSION_HOURS * 3600_000, clientIp(req)),
    db.prepare('DELETE FROM owner_sessions WHERE expires_at < ?').bind(now),
    db.prepare('UPDATE owner_accounts SET last_login = ? WHERE id = ?').bind(now, ownerId),
  ]);
  return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}
const clearCookie = `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;

async function sessionOwner(db: D1Database, req: Request) {
  const token = readCookie(req, COOKIE);
  if (!token || token.length < 20) return null;
  return db
    .prepare(
      'SELECT a.id, a.username, a.name FROM owner_sessions s JOIN owner_accounts a ON a.id = s.owner_id WHERE s.token_hash = ? AND s.expires_at > ?',
    )
    .bind(await sha256(token), Date.now())
    .first<{ id: string; username: string; name: string }>();
}

async function ownerProjects(db: D1Database, ownerId: string) {
  const { results } = await db.prepare('SELECT project FROM owner_projects WHERE owner_id = ?').bind(ownerId).all<{ project: string }>();
  return results.map((r) => r.project);
}

// ------------------------------------------------------------------ rutas del dueño

export async function ownerApi(env: Env, req: Request, path: string): Promise<Response> {
  const db = env.DB;
  const ip = clientIp(req);
  if (req.method !== 'GET' && !sameOrigin(req)) return fail(403, 'Origen no permitido');

  if (path === '/api/owner/session' && req.method === 'GET') {
    const o = await sessionOwner(db, req);
    return json({ authenticated: !!o, username: o?.username, name: o?.name });
  }

  if (path === '/api/owner/login' && req.method === 'POST') {
    const b = await body<{ username?: string; password?: string }>(req);
    const username = String(b?.username ?? '')
      .trim()
      .toLowerCase();
    // Bloqueo por conexión (5 fallos / 15 min) y por usuario (5 fallos / 15 min)
    if ((await isThrottled(db, ipKey(ip))) || (USERNAME.test(username) && (await isThrottled(db, userKey(username)))))
      return fail(429, 'Demasiados intentos fallidos. Espera 15 minutos.');
    const a = USERNAME.test(username)
      ? await db.prepare('SELECT * FROM owner_accounts WHERE username = ?').bind(username).first<Account>()
      : null;
    const passOk = await verifyPassword(String(b?.password ?? ''), a?.pass_hash ?? DUMMY_HASH);
    if (!a || !passOk || (await ownerProjects(db, a.id)).length === 0) {
      await recordAttempt(db, ipKey(ip), false);
      if (USERNAME.test(username)) await recordAttempt(db, userKey(username), false);
      return fail(401, 'Usuario o contraseña incorrectos');
    }
    await recordAttempt(db, ipKey(ip), true);
    return json({ ok: true }, 200, { 'Set-Cookie': await createOwnerSession(db, req, a.id) });
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
    await audit(db, 'owner_lots', b.project, { by: owner.username, changes: b.changes.slice(0, 50) }, ip);
    return json({ ok: true });
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
        'SELECT a.id, a.username, a.name, a.last_login, op.created_at AS since FROM owner_projects op JOIN owner_accounts a ON a.id = op.owner_id WHERE op.project = ? ORDER BY op.created_at',
      )
      .bind(project)
      .all();
    const { results: all } = await db.prepare('SELECT id, username, name FROM owner_accounts ORDER BY username').all();
    return json({ owners, accounts: all });
  }

  if (req.method !== 'POST') return fail(404, 'No encontrado');

  if (path === '/api/admin/owners/create') {
    const b = await body<{ project?: string; username?: string; name?: string }>(req);
    const username = String(b?.username ?? '')
      .trim()
      .toLowerCase();
    const name = String(b?.name ?? '')
      .trim()
      .slice(0, 80);
    if (!b?.project || !SLUG.test(b.project) || !(await loadDetail(env, req, b.project, true))) return fail(404, 'Proyecto no encontrado');
    if (!USERNAME.test(username))
      return fail(400, 'Usuario inválido: 3 a 40 caracteres, minúsculas, números, punto o guion (ej. maria.gomez)');
    if (!name) return fail(400, 'Escribe el nombre del dueño');
    if (await db.prepare('SELECT 1 FROM owner_accounts WHERE username = ?').bind(username).first())
      return fail(409, 'Ese usuario ya existe');
    const password = generatePassword();
    const id = crypto.randomUUID();
    const now = Date.now();
    await db.batch([
      db
        .prepare('INSERT INTO owner_accounts (id, username, name, pass_hash, pass_enc, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, username, name, await hashPassword(password), await encrypt(db, password), now),
      db.prepare('INSERT INTO owner_projects (owner_id, project, created_at) VALUES (?, ?, ?)').bind(id, b.project, now),
    ]);
    await audit(db, 'owner_create', b.project, { by: username }, ip);
    return json({ ok: true, id, username, password });
  }

  const b = await body<{ id?: string; ownerId?: string; project?: string }>(req);
  const id = String(b?.id ?? b?.ownerId ?? '');
  if (!ID.test(id)) return fail(400, 'Solicitud inválida');
  const acc = await db.prepare('SELECT * FROM owner_accounts WHERE id = ?').bind(id).first<Account>();
  if (!acc) return fail(404, 'Usuario no encontrado');

  if (path === '/api/admin/owners/reveal') {
    await audit(db, 'owner_reveal', null, { by: acc.username }, ip);
    return json({ ok: true, password: await decrypt(db, acc.pass_enc) });
  }

  if (path === '/api/admin/owners/reset') {
    const password = generatePassword();
    await db.batch([
      db
        .prepare('UPDATE owner_accounts SET pass_hash = ?, pass_enc = ? WHERE id = ?')
        .bind(await hashPassword(password), await encrypt(db, password), id),
      db.prepare('DELETE FROM owner_sessions WHERE owner_id = ?').bind(id), // la contraseña anterior deja de servir
    ]);
    await audit(db, 'owner_reset', null, { by: acc.username }, ip);
    return json({ ok: true, password });
  }

  if (path === '/api/admin/owners/link') {
    if (!b?.project || !SLUG.test(b.project) || !(await loadDetail(env, req, b.project, true))) return fail(404, 'Proyecto no encontrado');
    await db
      .prepare('INSERT OR IGNORE INTO owner_projects (owner_id, project, created_at) VALUES (?, ?, ?)')
      .bind(id, b.project, Date.now())
      .run();
    await audit(db, 'owner_link', b.project, { by: acc.username }, ip);
    return json({ ok: true });
  }

  if (path === '/api/admin/owners/revoke') {
    if (!b?.project || !SLUG.test(b.project)) return fail(400, 'Solicitud inválida');
    await db.prepare('DELETE FROM owner_projects WHERE owner_id = ? AND project = ?').bind(id, b.project).run();
    // Si ya no tiene proyectos, se elimina la cuenta y sus sesiones
    const left = await db.prepare('SELECT COUNT(*) AS n FROM owner_projects WHERE owner_id = ?').bind(id).first<{ n: number }>();
    if (!left?.n)
      await db.batch([
        db.prepare('DELETE FROM owner_sessions WHERE owner_id = ?').bind(id),
        db.prepare('DELETE FROM owner_accounts WHERE id = ?').bind(id),
      ]);
    await audit(db, 'owner_revoke', b.project, { by: acc.username }, ip);
    return json({ ok: true });
  }

  return fail(404, 'No encontrado');
}
