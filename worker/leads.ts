/**
 * Solicitudes del formulario "Publica tu proyecto".
 * Se guardan en D1 y se gestionan desde el panel (pestaña Solicitudes).
 * Protección: mismo origen, campo trampa para bots, tiempo mínimo de llenado,
 * límite por IP y límite diario total, validación y longitudes máximas.
 */
import { audit } from './db';
import { body, fail, json, sameOrigin } from './http';

const PER_IP_HOUR = 5;
const PER_DAY_TOTAL = 300;
const STATUSES = ['new', 'contacted', 'archived'] as const;

const str = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .trim()
        .slice(0, max)
    : '';

export async function createLead(env: Env, req: Request, ip: string) {
  if (!sameOrigin(req)) return fail(403, 'Origen no permitido');
  const b = await body<Record<string, unknown>>(req);
  if (!b) return fail(400, 'Solicitud inválida');
  // Bots: campo oculto rellenado o envío demasiado rápido → se responde "ok" sin guardar
  if (str(b.website, 200) || Number(b.elapsed) < 2500) return json({ ok: true });

  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE ip = ? AND ts > ?')
    .bind(ip, now - 3600_000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= PER_IP_HOUR)
    return fail(429, 'Ya recibimos varias solicitudes desde tu conexión. Inténtalo más tarde o escríbenos por WhatsApp.');
  const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE ts > ?')
    .bind(now - 86400_000)
    .first<{ n: number }>();
  if ((today?.n ?? 0) >= PER_DAY_TOTAL) return fail(429, 'No pudimos registrar tu solicitud ahora. Escríbenos por WhatsApp.');

  const name = str(b.nombre, 100);
  const phone = str(b.telefono, 30);
  const email = str(b.email, 160).toLowerCase();
  const location = str(b.ubicacion, 160);
  if (!name || !location) return fail(400, 'Completa tu nombre y la ubicación del proyecto');
  if (phone.replace(/\D/g, '').length < 7) return fail(400, 'Escribe un teléfono válido');
  if (!/^[^\s@]{1,64}@[^\s@]{1,90}\.[^\s@]{2,}$/.test(email)) return fail(400, 'Escribe un correo válido');
  const lotsN = Number(b.lotes);

  await env.DB.prepare(
    'INSERT INTO leads (id, ts, name, company, phone, email, location, lots, message, status, notes, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      now,
      name,
      str(b.empresa, 120),
      phone,
      email,
      location,
      Number.isFinite(lotsN) && lotsN > 0 && lotsN < 1e6 ? Math.round(lotsN) : null,
      str(b.mensaje, 2000),
      'new',
      '',
      ip,
    )
    .run();
  // Limpieza: solicitudes archivadas de más de 2 años
  await env.DB.prepare("DELETE FROM leads WHERE status = 'archived' AND ts < ?")
    .bind(now - 730 * 86400_000)
    .run();
  return json({ ok: true });
}

/** Rutas /api/admin/leads* (la sesión ya fue verificada). */
export async function leadsAdmin(env: Env, req: Request, path: string, ip: string): Promise<Response> {
  const db = env.DB;
  if (path === '/api/admin/leads' && req.method === 'GET') {
    const { results } = await db
      .prepare('SELECT id, ts, name, company, phone, email, location, lots, message, status, notes FROM leads ORDER BY ts DESC LIMIT 500')
      .all();
    return json({ items: results });
  }
  if (path === '/api/admin/leads/count' && req.method === 'GET') {
    const r = await db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'").first<{ n: number }>();
    return json({ new: r?.n ?? 0 });
  }
  if (req.method !== 'POST') return fail(404, 'No encontrado');
  const b = await body<{ id?: string; status?: string; notes?: string }>(req);
  if (!b?.id || !/^[a-f0-9-]{36}$/.test(b.id)) return fail(400, 'Solicitud inválida');
  if (path === '/api/admin/leads/update') {
    if (b.status && !(STATUSES as readonly string[]).includes(b.status)) return fail(400, 'Estado inválido');
    const res = await db
      .prepare('UPDATE leads SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?')
      .bind(b.status ?? null, typeof b.notes === 'string' ? str(b.notes, 2000) : null, b.id)
      .run();
    if (!(res.meta as { changes?: number }).changes) return fail(404, 'No encontrada');
    if (b.status) await audit(db, 'lead_status', null, { status: b.status }, ip);
    return json({ ok: true });
  }
  if (path === '/api/admin/leads/delete') {
    await db.prepare('DELETE FROM leads WHERE id = ?').bind(b.id).run();
    await audit(db, 'lead_delete', null, {}, ip);
    return json({ ok: true });
  }
  return fail(404, 'No encontrado');
}
