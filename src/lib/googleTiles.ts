/**
 * Mapas de Google por su servicio oficial (Map Tiles API).
 *
 * La clave NO va en el código: se lee de la variable de compilación VITE_GOOGLE_MAPS_KEY
 * (Cloudflare → Settings → Build → Variables, o el archivo .env.local en tu computador).
 * Sin clave, o si Google responde con error / cuota agotada, el visor usa el mapa gratis.
 */
const KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined)?.trim() || '';
const API = 'https://tile.googleapis.com';

export const googleEnabled = KEY.length > 0;

export type GoogleMapType = 'roadmap' | 'satellite';

interface Session {
  session: string;
  /** segundos desde 1970 */
  expiry: number;
  tileWidth: number;
}

const hiDpi = () => (typeof window !== 'undefined' ? window.devicePixelRatio > 1 : false);

function body(type: GoogleMapType, dpi: boolean) {
  const b: Record<string, unknown> = { mapType: type, language: 'es-CO', region: 'CO' };
  // Satélite con calles, lugares y negocios encima (vista "híbrida")
  if (type === 'satellite') b.layerTypes = ['layerRoadmap'];
  if (dpi) {
    b.highDpi = true;
    b.scale = 'scaleFactor2x';
  }
  return b;
}

async function create(type: GoogleMapType, dpi: boolean): Promise<Session> {
  const r = await fetch(`${API}/v1/createSession?key=${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body(type, dpi)),
  });
  if (!r.ok) throw new Error(`createSession ${type}: ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();
  return { session: j.session, expiry: Number(j.expiry), tileWidth: Number(j.tileWidth) || 256 };
}

/** Sesión de Google (se reutiliza hasta 1 h antes de vencer, normalmente ~2 semanas). */
export async function getSession(type: GoogleMapType): Promise<Session | null> {
  if (!googleEnabled) return null;
  const dpi = hiDpi();
  const cacheKey = `visorlotes:gsession:${type}:${dpi ? 2 : 1}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null') as Session | null;
    if (cached && cached.expiry * 1000 - Date.now() > 3600_000) return cached;
  } catch {
    /* sin almacenamiento */
  }
  let s: Session;
  try {
    s = await create(type, dpi);
  } catch (e) {
    if (!dpi) throw e;
    s = await create(type, false); // reintento sin alta resolución
  }
  try {
    localStorage.setItem(cacheKey, JSON.stringify(s));
  } catch {
    /* sin almacenamiento */
  }
  return s;
}

export const tileUrl = (s: Session) =>
  `${API}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(s.session)}&key=${encodeURIComponent(KEY)}`;

/** Olvida las sesiones guardadas (p. ej. si Google las rechaza). */
export function clearSessions() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('visorlotes:gsession:')) localStorage.removeItem(k);
  } catch {
    /* sin almacenamiento */
  }
}

/** Texto de derechos de autor que Google exige mostrar para la zona visible. */
export async function viewportCopyright(s: Session, zoom: number, b: { north: number; south: number; east: number; west: number }) {
  const q = new URLSearchParams({
    session: s.session,
    key: KEY,
    zoom: String(Math.round(zoom)),
    north: b.north.toFixed(5),
    south: b.south.toFixed(5),
    east: b.east.toFixed(5),
    west: b.west.toFixed(5),
  });
  const r = await fetch(`${API}/tile/v1/viewport?${q}`);
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  return (j.copyright as string) || '';
}
