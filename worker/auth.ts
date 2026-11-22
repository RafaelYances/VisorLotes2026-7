/** Sesiones y control de intentos de ingreso del panel. */
import { randomToken, sha256 } from './crypto';

export const COOKIE = '__Host-vl_admin';
const SESSION_HOURS = 12;

// Límites anti fuerza bruta
const IP_MAX_FAILS = 5; // por IP…
const IP_WINDOW = 15 * 60_000; // …cada 15 minutos
const GLOBAL_MAX_FAILS = 30; // en total…
const GLOBAL_WINDOW = 60 * 60_000; // …cada hora

export const clientIp = (req: Request) => req.headers.get('CF-Connecting-IP') || 'local';

function readCookie(req: Request, name: string) {
  const raw = req.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function createSession(db: D1Database, req: Request) {
  const token = randomToken(32);
  const now = Date.now();
  await db
    .prepare('INSERT INTO sessions (token_hash, created_at, expires_at, ip, ua) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), now, now + SESSION_HOURS * 3600_000, clientIp(req), (req.headers.get('User-Agent') || '').slice(0, 200))
    .run();
  // Limpieza de sesiones vencidas
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export const clearCookie = `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;

/** Devuelve true si la petición trae una sesión válida. */
export async function hasSession(db: D1Database, req: Request) {
  const token = readCookie(req, COOKIE);
  if (!token || token.length < 20) return false;
  const row = await db
    .prepare('SELECT expires_at FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ expires_at: number }>();
  return !!row && row.expires_at > Date.now();
}

export async function destroySession(db: D1Database, req: Request) {
  const token = readCookie(req, COOKIE);
  if (token)
    await db
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256(token))
      .run();
}

export async function destroyAllSessions(db: D1Database) {
  await db.prepare('DELETE FROM sessions').run();
}

/** ¿Está bloqueada esta IP (o el sistema) por demasiados intentos fallidos? */
export async function isThrottled(db: D1Database, ip: string) {
  const now = Date.now();
  const perIp = await db
    .prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ok = 0 AND ts > ?')
    .bind(ip, now - IP_WINDOW)
    .first<{ n: number }>();
  if ((perIp?.n ?? 0) >= IP_MAX_FAILS) return true;
  const global = await db
    .prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ok = 0 AND ts > ?')
    .bind(now - GLOBAL_WINDOW)
    .first<{ n: number }>();
  return (global?.n ?? 0) >= GLOBAL_MAX_FAILS;
}

export async function recordAttempt(db: D1Database, ip: string, ok: boolean) {
  const now = Date.now();
  await db.batch([
    db.prepare('INSERT INTO login_attempts (ip, ts, ok) VALUES (?, ?, ?)').bind(ip, now, ok ? 1 : 0),
    db.prepare('DELETE FROM login_attempts WHERE ts < ?').bind(now - 24 * 3600_000),
  ]);
}
