import { asset } from '../lib/data';
import type { GalleryItem, Highlight, LotStatus, Project, ProjectCard } from '../types';

export type AdminProjectCard = ProjectCard & { visible: boolean; source: 'static' | 'panel' };

/** Datos editables de un proyecto. */
export interface ProjectMeta {
  name: string;
  tagline: string;
  description: string;
  status: string;
  location: { city: string; region: string; lat?: number | string; lng?: number | string; mapsUrl?: string };
  contact: { whatsapp: string; phoneLabel: string };
  currency: string;
  highlights: Highlight[];
  setbacks: { front: number; back: number; side: number };
  logo: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(asset(`api/admin/${path}`), {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new ApiError(r.status, data.error || `Error ${r.status}`);
  return data;
}

export interface SessionInfo {
  setup: boolean;
  authenticated: boolean;
  email?: string;
}

export interface AuditItem {
  ts: number;
  action: string;
  project: string | null;
  detail: string;
  ip: string;
}

export interface LotChange {
  lot: string;
  status: LotStatus;
  price: number | null;
}

export const adminApi = {
  session: () => call<SessionInfo>('session'),
  setupStart: (token: string) => call<{ secret: string; otpauth: string }>('setup/start', { token }),
  setupFinish: (d: { token: string; email: string; password: string; secret: string; code: string }) =>
    call<{ ok: true }>('setup/finish', d),
  login: (password: string, code: string) => call<{ ok: true }>('login', { password, code }),
  logout: () => call<{ ok: true }>('logout', {}),
  logoutAll: () => call<{ ok: true }>('logout-all', {}),
  saveLots: (project: string, changes: LotChange[]) => call<{ ok: true; updated: number }>('lots', { project, changes }),
  audit: () => call<{ items: AuditItem[] }>('audit'),
  gallery: (project: string) => call<{ items: GalleryItem[] }>(`gallery?project=${encodeURIComponent(project)}`),
  galleryUpdate: (project: string, changes: { order?: string[]; items?: { id: string; caption?: string; cover?: boolean }[] }) =>
    call<{ ok: true; items: GalleryItem[] }>('gallery/update', { project, ...changes }),
  galleryDelete: (project: string, id: string) => call<{ ok: true }>('gallery/delete', { project, id }),
  projects: () => call<{ projects: AdminProjectCard[] }>('projects'),
  project: (slug: string) =>
    call<Project & { _admin: { source: 'static' | 'panel'; visible: boolean; hasPlan: boolean } }>(`project/${slug}`),
  saveProject: (d: { slug: string; create?: boolean; meta: ProjectMeta; plan?: unknown; preview?: unknown }) =>
    call<{ ok: true; visible: boolean }>('projects/save', d),
  setVisibility: (slug: string, visible: boolean, password: string, code: string) =>
    call<{ ok: true; visible: boolean }>('projects/visibility', { slug, visible, password, code }),
  deleteProject: (slug: string, confirmName: string, password: string, code: string) =>
    call<{ ok: true }>('projects/delete', { slug, confirmName, password, code }),
  async uploadLogo(slug: string, file: Blob): Promise<{ ok: true; src: string }> {
    const fd = new FormData();
    fd.append('slug', slug);
    fd.append('logo', file, 'logo');
    const r = await fetch(asset('api/admin/projects/logo'), { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = (await r.json().catch(() => ({}))) as { ok: true; src: string; error?: string };
    if (!r.ok) throw new ApiError(r.status, data.error || `Error ${r.status}`);
    return data;
  },
};
