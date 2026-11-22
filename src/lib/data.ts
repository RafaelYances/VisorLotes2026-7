import { useEffect, useState } from 'react';
import type { LotStatus, Project, ProjectCard, ProjectStats } from '../types';

/** Ruta a un archivo de /public respetando la subcarpeta de publicación (GitHub Pages). */
export const asset = (p: string) => (/^(https?:)?\/\//.test(p) ? p : import.meta.env.BASE_URL + p.replace(/^\//, ''));

const cache = new Map<string, Promise<unknown>>();

function load<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`No se pudo cargar ${url} (${r.status})`);
        return r.json();
      }),
    );
  }
  return cache.get(url) as Promise<T>;
}

/** Estados y precios editados desde el panel: { proyecto: { lote: [estado, precio] } } */
export type Overrides = Record<string, Record<string, [LotStatus, number | null]>>;

export async function loadOverrides(): Promise<Overrides> {
  try {
    const r = await fetch(asset('api/public/lots'), { cache: 'no-store' });
    if (!r.ok) return {};
    return ((await r.json()) as { overrides: Overrides }).overrides ?? {};
  } catch {
    return {}; // sin servidor (p. ej. vista previa local): se usan los datos publicados
  }
}

const countStats = (statuses: LotStatus[], base: ProjectStats): ProjectStats => ({
  ...base,
  available: statuses.filter((s) => s === 'available').length,
  reserved: statuses.filter((s) => s === 'reserved').length,
  sold: statuses.filter((s) => s === 'sold').length,
});

export function applyOverrides(p: Project, o: Overrides[string] = {}): Project {
  const lots = p.lots.map((l) => (o[l.id] ? { ...l, status: o[l.id][0], price: o[l.id][1] } : l));
  return {
    ...p,
    lots,
    stats: countStats(
      lots.map((l) => l.status),
      p.stats,
    ),
  };
}

function applyCard(c: ProjectCard, o: Overrides[string] = {}): ProjectCard {
  const lots = c.preview.lots.map((l) => (o[l.id] ? { ...l, s: o[l.id][0] } : l));
  return {
    ...c,
    preview: { ...c.preview, lots },
    stats: countStats(
      lots.map((l) => l.s),
      c.stats,
    ),
  };
}

export const loadProjects = () =>
  Promise.all([load<ProjectCard[]>(asset('data/projects.json')), loadOverrides()]).then(([cards, o]) =>
    cards.map((c) => applyCard(c, o[c.slug])),
  );
export const loadProjectRaw = (slug: string) => load<Project>(asset(`data/projects/${slug}.json`));
export const loadProject = (slug: string) =>
  Promise.all([loadProjectRaw(slug), loadOverrides()]).then(([p, o]) => applyOverrides(p, o[slug]));

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    fn()
      .then((data) => alive && setState({ data, loading: false }))
      .catch((error) => alive && setState({ error, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
