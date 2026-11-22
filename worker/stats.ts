/**
 * Estadísticas de cada proyecto (anónimas).
 * - El navegador envía eventos: visita al proyecto, lote consultado, clic en WhatsApp,
 *   diseño de casa probado y compartir.
 * - Se guarda una fila por (día, proyecto, visitante anónimo, evento, lote): así cada
 *   persona cuenta una sola vez por día y lote, y no se pueden inflar los números
 *   recargando la página.
 * - No se guardan IPs, nombres ni datos personales: el visitante es un identificador
 *   aleatorio que vive en su navegador.
 * - No se cuentan las visitas del administrador ni de los dueños, ni las de robots.
 */
import { readCookie } from './auth';
import { body, fail, json, sameOrigin } from './http';
import { loadDetail } from './projects';

const EVENTS = new Set(['view', 'lot', 'wa', 'casa', 'share']);
const BOT = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|whatsapp|telegram|lighthouse|curl|wget|python|node-fetch/i;
const COLOMBIA_OFFSET = -5 * 3600_000;

/** Fecha (AAAA-MM-DD) en hora de Colombia. */
const dayOf = (t = Date.now()) => new Date(t + COLOMBIA_OFFSET).toISOString().slice(0, 10);

// Límite simple por conexión (por instancia del servidor) contra abusos
const hits = new Map<string, { n: number; at: number }>();
function tooMany(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) {
    hits.set(ip, { n: 1, at: now });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  return ++h.n > 120;
}

// Lotes válidos y visibilidad por proyecto (caché corta)
const lotsCache = new Map<string, { at: number; ids: Set<string> | null }>();
async function visibleLots(env: Env, req: Request, slug: string) {
  const hit = lotsCache.get(slug);
  if (hit && Date.now() - hit.at < 60_000) return hit.ids;
  const d = await loadDetail(env, req, slug); // solo proyectos visibles
  const ids = d ? new Set(((d.lots as { id: string }[]) ?? []).map((l) => l.id)) : null;
  lotsCache.set(slug, { at: Date.now(), ids });
  return ids;
}

export async function track(env: Env, req: Request, ip: string) {
  if (!sameOrigin(req)) return fail(403, 'Origen no permitido');
  const ok = json({ ok: true });
  // No contar al administrador, a los dueños ni a robots
  if (readCookie(req, '__Host-vl_admin') || readCookie(req, '__Host-vl_owner')) return ok;
  if (BOT.test(req.headers.get('User-Agent') || '')) return ok;
  if (tooMany(ip)) return ok;

  const b = await body<{ p?: string; e?: string; l?: string; v?: string }>(req);
  const project = String(b?.p ?? '');
  const event = String(b?.e ?? '');
  const lot = String(b?.l ?? '');
  const visitor = String(b?.v ?? '');
  if (!/^[a-z0-9-]{1,60}$/.test(project) || !EVENTS.has(event) || !/^[a-zA-Z0-9-]{16,40}$/.test(visitor))
    return fail(400, 'Evento inválido');
  if (lot && !/^[A-Z0-9]{1,10}-[A-Z0-9]{1,10}$/.test(lot)) return fail(400, 'Evento inválido');
  const ids = await visibleLots(env, req, project);
  if (!ids || (lot && !ids.has(lot))) return ok;

  await env.DB.prepare('INSERT OR IGNORE INTO stats_seen (day, project, visitor, event, lot) VALUES (?, ?, ?, ?, ?)')
    .bind(dayOf(), project, visitor, event, lot)
    .run();
  // Limpieza ocasional: se guardan 400 días
  if (Math.random() < 0.002)
    await env.DB.prepare('DELETE FROM stats_seen WHERE day < ?')
      .bind(dayOf(Date.now() - 400 * 86400_000))
      .run();
  return ok;
}

export interface ProjectStatsReport {
  days: number;
  from: string;
  to: string;
  totals: { visitors: number; lotViews: number; whatsapp: number; houses: number; shares: number };
  previous: { visitors: number; whatsapp: number };
  daily: { day: string; visitors: number; whatsapp: number }[];
  topLots: { lot: string; views: number; whatsapp: number }[];
}

/** Resumen de estadísticas de un proyecto para los últimos `days` días. */
export async function projectStats(db: D1Database, project: string, days: number): Promise<ProjectStatsReport> {
  const to = dayOf();
  const from = dayOf(Date.now() - (days - 1) * 86400_000);
  const prevFrom = dayOf(Date.now() - (2 * days - 1) * 86400_000);
  const prevTo = dayOf(Date.now() - days * 86400_000);

  const [totals, prev, daily, top] = await db.batch([
    db
      .prepare(
        `SELECT
           COUNT(DISTINCT CASE WHEN event = 'view' THEN visitor END) AS visitors,
           SUM(event = 'lot') AS lotViews,
           COUNT(DISTINCT CASE WHEN event = 'wa' THEN visitor || day END) AS whatsapp,
           COUNT(DISTINCT CASE WHEN event = 'casa' THEN visitor || day END) AS houses,
           SUM(event = 'share') AS shares
         FROM stats_seen WHERE project = ? AND day BETWEEN ? AND ?`,
      )
      .bind(project, from, to),
    db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN event = 'view' THEN visitor END) AS visitors,
                COUNT(DISTINCT CASE WHEN event = 'wa' THEN visitor || day END) AS whatsapp
         FROM stats_seen WHERE project = ? AND day BETWEEN ? AND ?`,
      )
      .bind(project, prevFrom, prevTo),
    db
      .prepare(
        `SELECT day,
                COUNT(DISTINCT CASE WHEN event = 'view' THEN visitor END) AS visitors,
                COUNT(DISTINCT CASE WHEN event = 'wa' THEN visitor END) AS whatsapp
         FROM stats_seen WHERE project = ? AND day BETWEEN ? AND ? GROUP BY day`,
      )
      .bind(project, from, to),
    db
      .prepare(
        `SELECT lot, SUM(event = 'lot') AS views, COUNT(DISTINCT CASE WHEN event = 'wa' THEN visitor || day END) AS whatsapp
         FROM stats_seen WHERE project = ? AND day BETWEEN ? AND ? AND lot != ''
         GROUP BY lot ORDER BY views DESC, whatsapp DESC LIMIT 10`,
      )
      .bind(project, from, to),
  ]);

  const t = (totals.results[0] ?? {}) as Record<string, number | null>;
  const p = (prev.results[0] ?? {}) as Record<string, number | null>;
  const byDay = new Map((daily.results as { day: string; visitors: number; whatsapp: number }[]).map((r) => [r.day, r]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOf(Date.now() - i * 86400_000);
    const r = byDay.get(d);
    series.push({ day: d, visitors: r?.visitors ?? 0, whatsapp: r?.whatsapp ?? 0 });
  }
  return {
    days,
    from,
    to,
    totals: {
      visitors: t.visitors ?? 0,
      lotViews: t.lotViews ?? 0,
      whatsapp: t.whatsapp ?? 0,
      houses: t.houses ?? 0,
      shares: t.shares ?? 0,
    },
    previous: { visitors: p.visitors ?? 0, whatsapp: p.whatsapp ?? 0 },
    daily: series,
    topLots: (top.results as { lot: string; views: number; whatsapp: number }[]).filter((r) => r.views > 0 || r.whatsapp > 0),
  };
}

export function parseDays(req: Request) {
  const d = Number(new URL(req.url).searchParams.get('days'));
  return [7, 30, 90].includes(d) ? d : 30;
}
