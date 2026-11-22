/** Esquema de la base de datos D1. Se crea solo la primera vez (idempotente). */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS admin (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     email TEXT NOT NULL,
     pass TEXT NOT NULL,
     totp TEXT NOT NULL,
     totp_last INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     ip TEXT,
     ua TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, ts INTEGER NOT NULL, ok INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS login_attempts_ip_ts ON login_attempts (ip, ts)`,
  `CREATE TABLE IF NOT EXISTS lot_overrides (
     project TEXT NOT NULL,
     lot TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'sold')),
     price INTEGER,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (project, lot)
   )`,
  `CREATE TABLE IF NOT EXISTS audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts INTEGER NOT NULL,
     action TEXT NOT NULL,
     project TEXT,
     detail TEXT,
     ip TEXT
   )`,
];

let ready: Promise<void> | null = null;

export function ensureSchema(db: D1Database) {
  ready ??= db
    .batch(SCHEMA.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

export async function audit(db: D1Database, action: string, project: string | null, detail: unknown, ip: string) {
  await db
    .prepare('INSERT INTO audit (ts, action, project, detail, ip) VALUES (?, ?, ?, ?, ?)')
    .bind(Date.now(), action, project, JSON.stringify(detail).slice(0, 4000), ip)
    .run();
}
