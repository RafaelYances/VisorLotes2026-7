import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { STATUS } from '../config';
import { loadProject } from '../lib/data';
import { baseStyle } from '../lib/mapStyle';
import type { ProjectCard } from '../types';

/** Mapa satelital decorativo del hero: órbita lenta sobre el proyecto destacado. */
export default function HeroMap({ projects }: { projects: ProjectCard[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current || !projects.length) return;
    const main = projects[0];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const map = new maplibregl.Map({
      container: ref.current,
      style: { ...baseStyle, layers: baseStyle.layers.filter((l) => l.id !== 'places') },
      center: [main.location.lng, main.location.lat],
      zoom: 16.4,
      pitch: 52,
      bearing: -30,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    // En escritorio, desplazar el proyecto hacia la derecha (el texto ocupa la izquierda)
    if (window.innerWidth >= 1024) map.setPadding({ left: window.innerWidth * 0.45, top: 0, right: 0, bottom: 0 });

    let raf = 0;
    let alive = true;
    map.on('load', async () => {
      const details = await Promise.all(projects.map((p) => loadProject(p.slug).catch(() => null)));
      if (!alive) return;
      const features = details.flatMap((d) =>
        (d?.lots ?? []).map((l) => ({
          type: 'Feature' as const,
          properties: { color: STATUS[l.status].color },
          geometry: { type: 'Polygon' as const, coordinates: [l.coords] },
        })),
      );
      const roads = details.flatMap((d) =>
        (d?.roads ?? []).map((r) => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Polygon' as const, coordinates: [r] },
        })),
      );
      map.addSource('roads', { type: 'geojson', data: { type: 'FeatureCollection', features: roads } });
      map.addSource('lots', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({ id: 'roads', type: 'fill', source: 'roads', paint: { 'fill-color': '#e2e8f0', 'fill-opacity': 0.55 } });
      map.addLayer({ id: 'lots', type: 'fill', source: 'lots', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.6 } });
      map.addLayer({
        id: 'lots-line',
        type: 'line',
        source: 'lots',
        paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.9 },
      });
      map.once('idle', () => setReady(true));

      if (reduce) return;
      let last = performance.now();
      const tick = (t: number) => {
        const dt = t - last;
        last = t;
        map.setBearing(map.getBearing() + dt * 0.0025);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      map.remove();
    };
  }, [projects]);

  return (
    <div className={`absolute inset-0 transition-opacity duration-[1500ms] ${ready ? 'opacity-100' : 'opacity-0'}`}>
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}
