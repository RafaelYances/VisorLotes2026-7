import { asset } from './data';

/** Identificador anónimo del visitante (aleatorio, solo vive en su navegador). */
let memoryId = '';
function visitorId() {
  try {
    let v = localStorage.getItem('lc:vid');
    if (!v || !/^[a-zA-Z0-9-]{16,40}$/.test(v)) {
      v = crypto.randomUUID();
      localStorage.setItem('lc:vid', v);
    }
    return v;
  } catch {
    memoryId ||= crypto.randomUUID();
    return memoryId;
  }
}

export type TrackEvent = 'view' | 'lot' | 'wa' | 'casa' | 'share';

/** Registra un evento de estadísticas (anónimo; si falla, no afecta al visitante). */
export function track(project: string, event: TrackEvent, lot?: string) {
  try {
    fetch(asset('api/public/track'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: project, e: event, l: lot ?? '', v: visitorId() }),
      keepalive: true, // se envía aunque la persona se vaya a WhatsApp
    }).catch(() => {});
  } catch {
    /* sin estadísticas */
  }
}
