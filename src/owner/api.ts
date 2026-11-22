import { ApiError } from '../admin/api';
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
  session: () => call<{ authenticated: boolean; email?: string; name?: string }>('session'),
  checkInvite: (token: string) => call<{ project: string; expires: number }>('invite/check', { token }),
  startInvite: (token: string) => call<{ secret: string; otpauth: string }>('invite/start', { token }),
  acceptInvite: (d: {
    token: string;
    mode: 'new' | 'existing';
    name?: string;
    email: string;
    password: string;
    secret?: string;
    code: string;
  }) => call<{ ok: true }>('invite/accept', d),
  login: (email: string, password: string, code: string) => call<{ ok: true }>('login', { email, password, code }),
  logout: () => call<{ ok: true }>('logout', {}),
  projects: () => call<{ projects: { slug: string; name: string }[] }>('projects'),
  project: (slug: string) => call<Project>(`project/${slug}`),
  setStatus: (project: string, changes: { lot: string; status: LotStatus }[]) => call<{ ok: true }>('lots', { project, changes }),
  changePassword: (current: string, code: string, next: string) => call<{ ok: true }>('password', { current, code, next }),
};
