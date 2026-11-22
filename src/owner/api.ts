import { ApiError } from '../admin/api';
import type { StatsReport } from '../components/StatsView';
import { asset } from '../lib/data';
import type { LotStatus, Project } from '../types';

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(asset(`api/owner/${path}`), {
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

export const ownerApi = {
  session: () => call<{ authenticated: boolean; username?: string; name?: string }>('session'),
  login: (username: string, password: string) => call<{ ok: true }>('login', { username, password }),
  logout: () => call<{ ok: true }>('logout', {}),
  projects: () => call<{ projects: { slug: string; name: string }[] }>('projects'),
  project: (slug: string) => call<Project>(`project/${slug}`),
  stats: (project: string, days: number) => call<StatsReport>(`stats?project=${encodeURIComponent(project)}&days=${days}`),
  setStatus: (project: string, changes: { lot: string; status: LotStatus }[]) => call<{ ok: true }>('lots', { project, changes }),
};
