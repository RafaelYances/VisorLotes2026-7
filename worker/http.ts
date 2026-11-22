/** Utilidades HTTP compartidas por el servidor. */
type Json = Record<string, unknown>;

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra },
  });
}
export const fail = (status: number, error: string) => json({ error }, status);

/** Protección CSRF: las escrituras deben venir de esta misma página y en JSON. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('Origin');
  return !!origin && origin === new URL(req.url).origin && (req.headers.get('Content-Type') || '').startsWith('application/json');
}

export async function body<T = Json>(req: Request): Promise<T | null> {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > 200_000) return null;
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Mismo origen (para subidas multipart, donde el tipo no es JSON). */
export function originOk(req: Request) {
  const origin = req.headers.get('Origin');
  return !!origin && origin === new URL(req.url).origin;
}
