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
  `CREATE TABLE IF NOT EXISTS gallery (
     id TEXT PRIMARY KEY,
     project TEXT NOT NULL,
     type TEXT NOT NULL CHECK (type IN ('image', 'video')),
     src TEXT NOT NULL,
     thumb TEXT,
     poster TEXT,
     w INTEGER,
     h INTEGER,
     blur TEXT,
     caption TEXT NOT NULL DEFAULT '',
     cover INTEGER NOT NULL DEFAULT 0,
     position INTEGER NOT NULL DEFAULT 0,
     bytes INTEGER NOT NULL DEFAULT 0,
     r2keys TEXT NOT NULL DEFAULT '[]',
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS gallery_project ON gallery (project, position)`,
  `CREATE TABLE IF NOT EXISTS projects (
     slug TEXT PRIMARY KEY,
     source TEXT NOT NULL CHECK (source IN ('static', 'panel')),
     meta TEXT NOT NULL DEFAULT '{}',
     card TEXT,
     has_plan INTEGER NOT NULL DEFAULT 0,
     visible INTEGER NOT NULL DEFAULT 1,
     deleted INTEGER NOT NULL DEFAULT 0,
     position INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS project_flags (project TEXT NOT NULL, flag TEXT NOT NULL, PRIMARY KEY (project, flag))`,
  `CREATE TABLE IF NOT EXISTS leads (
     id TEXT PRIMARY KEY,
     ts INTEGER NOT NULL,
     name TEXT NOT NULL,
     company TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL,
     email TEXT NOT NULL,
     location TEXT NOT NULL,
     lots INTEGER,
     message TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'archived')),
     notes TEXT NOT NULL DEFAULT '',
     ip TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS leads_ts ON leads (ts)`,
  `CREATE INDEX IF NOT EXISTS leads_ip_ts ON leads (ip, ts)`,
  // Versión anterior del portal de dueños (invitaciones + TOTP): reemplazada por owner_accounts
  `DROP TABLE IF EXISTS owner_invites`,
  `DROP TABLE IF EXISTS owners`,
  `CREATE TABLE IF NOT EXISTS owner_accounts (
     id TEXT PRIMARY KEY,
     username TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL DEFAULT '',
     pass_hash TEXT NOT NULL,
     pass_enc TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_login INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS app_keys (name TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS owner_projects (
     owner_id TEXT NOT NULL,
     project TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (owner_id, project)
   )`,
  `CREATE TABLE IF NOT EXISTS owner_sessions (
     token_hash TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     ip TEXT
   )`,
  // Accesos y sesiones que pertenecían a cuentas de la versión anterior
  `DELETE FROM owner_projects WHERE owner_id NOT IN (SELECT id FROM owner_accounts)`,
  `DELETE FROM owner_sessions WHERE owner_id NOT IN (SELECT id FROM owner_accounts)`,
  `CREATE TABLE IF NOT EXISTS stats_seen (
     day TEXT NOT NULL,
     project TEXT NOT NULL,
     visitor TEXT NOT NULL,
     event TEXT NOT NULL,
     lot TEXT NOT NULL DEFAULT '',
     PRIMARY KEY (project, day, visitor, event, lot)
   ) WITHOUT ROWID`,
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
