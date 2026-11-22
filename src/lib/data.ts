import { useEffect, useState } from 'react';
import type { Project, ProjectCard } from '../types';

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

export const loadProjects = () => load<ProjectCard[]>(asset('data/projects.json'));
export const loadProject = (slug: string) => load<Project>(asset(`data/projects/${slug}.json`));

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
