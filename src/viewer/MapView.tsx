import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MLMap } from 'maplibre-gl';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { STATUS } from '../config';
import { m2 } from '../lib/format';
import { clearSessions, getSession, googleEnabled, tileUrl, viewportCopyright } from '../lib/googleTiles';
import { addGoogleLayers, applyBase, buildStyle, FONT, FONT_BOLD, osmLabelLayers, type BaseLayer, type Provider } from '../lib/mapStyle';
import type { Lot, Project } from '../types';

export interface MapHandle {
  flyToLot: (lot: Lot, opts?: { bearing?: number; zoom?: number }) => void;
  fitProject: () => void;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetNorth: () => void;
  getMap: () => MLMap | null;
}

interface Props {
  project: Project;
  base: BaseLayer;
  selectedId: string | null;
  visibleIds: Set<string>;
  houseFeatures: GeoJSON.FeatureCollection | null;
  padding: { top: number; right: number; bottom: number; left: number };
  onSelect: (id: string | null) => void;
  onBearing?: (deg: number) => void;
}

const lotFeatures = (project: Project): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: project.lots.map((l) => poly(l.coords, { id: l.id, status: l.status, numero: l.numero, color: STATUS[l.status].color })),
});

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const poly = (coords: [number, number][], properties: Record<string, unknown> = {}) => ({
  type: 'Feature' as const,
  properties,
  geometry: { type: 'Polygon' as const, coordinates: [coords] },
});

export const MapView = forwardRef<MapHandle, Props>(function MapView(
  { project, base, selectedId, visibleIds, houseFeatures, padding, onSelect, onBearing },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  /** Ejecuta una acción de cámara ahora o en cuanto el mapa termine de cargar. */
  const whenReady = (fn: () => void) => {
    if (loadedRef.current) fn();
    else pending.current = fn;
  };
  const [hover, setHover] = useState<{ lot: Lot; x: number; y: number } | null>(null);
  const prevSel = useRef<string | null>(null);
  const paddingRef = useRef(padding);
  paddingRef.current = padding;
  const baseRef = useRef(base);
  baseRef.current = base;
  // Proveedor del mapa de fondo: Google (si hay clave y responde) o el mapa gratis
  const [provider, setProvider] = useState<Provider>('free');
  const sessions = useRef<{ roadmap?: Awaited<ReturnType<typeof getSession>>; satellite?: Awaited<ReturnType<typeof getSession>> }>({});
  const [copyright, setCopyright] = useState('');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const lotsById = useRef(new Map<string, Lot>());
  lotsById.current = new Map(project.lots.map((l) => [l.id, l]));

  // ---------------------------------------------------------------- init
  useEffect(() => {
    if (!el.current) return;
    let instance: MLMap | null = null;
    let cancelled = false;
    const setup = (style: maplibregl.StyleSpecification) => {
      const container = el.current;
      if (!container) return;
      const [w, s, e, n] = project.bounds;
      const map = new maplibregl.Map({
        container,
        style,
        bounds: [
          [w, s],
          [e, n],
        ] as LngLatBoundsLike,
        fitBoundsOptions: { padding: { ...padding, top: padding.top + 30 } },
        maxZoom: 21,
        minZoom: 12,
        attributionControl: false,
        dragRotate: true,
        pitchWithRotate: false,
        touchPitch: false,
      });
      mapRef.current = map;
      instance = map;
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left');
      // Créditos de los mapas a la izquierda: a la derecha quedarían ocultos tras el panel
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
      map.on('rotate', () => onBearing?.(map.getBearing()));

      map.on('load', () => {
        map.addSource('roads', { type: 'geojson', data: { type: 'FeatureCollection', features: project.roads.map((r) => poly(r)) } });
        map.addSource('greens', { type: 'geojson', data: { type: 'FeatureCollection', features: project.greens.map((r) => poly(r)) } });
        map.addSource('lots', {
          type: 'geojson',
          promoteId: 'id',
          data: lotFeatures(project),
        });
        map.addSource('lot-points', {
          type: 'geojson',
          promoteId: 'id',
          data: {
            type: 'FeatureCollection',
            features: project.lots.map((l) => ({
              type: 'Feature',
              properties: { id: l.id, numero: l.numero },
              geometry: { type: 'Point', coordinates: l.center },
            })),
          },
        });
        map.addSource('manzanas', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: project.manzanas.map((mz) => ({
              type: 'Feature',
              properties: { name: `Mz ${mz.name}` },
              geometry: { type: 'Point', coordinates: mz.center },
            })),
          },
        });
        map.addSource('labels', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: project.labels.map((l) => ({
              type: 'Feature',
              properties: l,
              geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
            })),
          },
        });
        map.addSource('house', { type: 'geojson', data: EMPTY });

        map.addLayer({ id: 'greens', type: 'fill', source: 'greens', paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.55 } });
        map.addLayer({ id: 'roads', type: 'fill', source: 'roads', paint: { 'fill-color': '#cbd5e1', 'fill-opacity': 0.82 } });
        map.addLayer({
          id: 'roads-line',
          type: 'line',
          source: 'roads',
          paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.7 },
        });

        map.addLayer({
          id: 'lots-fill',
          type: 'fill',
          source: 'lots',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              16,
              [
                'case',
                ['boolean', ['feature-state', 'dim'], false],
                0.12,
                ['boolean', ['feature-state', 'selected'], false],
                0.9,
                ['boolean', ['feature-state', 'hover'], false],
                0.8,
                0.62,
              ],
              19.5,
              [
                'case',
                ['boolean', ['feature-state', 'dim'], false],
                0.08,
                ['boolean', ['feature-state', 'selected'], false],
                0.5,
                ['boolean', ['feature-state', 'hover'], false],
                0.5,
                0.3,
              ],
            ],
            'fill-opacity-transition': { duration: 250 },
          },
        });
        map.addLayer({
          id: 'lots-line',
          type: 'line',
          source: 'lots',
          paint: {
            'line-color': '#ffffff',
            'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 18, 1.4, 20, 2.2],
            'line-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.35, 0.95],
          },
        });
        map.addLayer({
          id: 'lots-selected-glow',
          type: 'line',
          source: 'lots',
          paint: {
            'line-color': '#a7f3d0',
            'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 12, 0],
            'line-blur': 8,
            'line-opacity': 0.9,
          },
        });
        map.addLayer({
          id: 'lots-selected',
          type: 'line',
          source: 'lots',
          paint: {
            'line-color': '#ffffff',
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              3.5,
              ['boolean', ['feature-state', 'hover'], false],
              2.5,
              0,
            ],
          },
        });

        // Casa sobre el lote
        map.addLayer({
          id: 'house-fill',
          type: 'fill',
          source: 'house',
          paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['case', ['==', ['get', 'role'], 'buildable'], 0, 0.95] },
        });
        map.addLayer({
          id: 'house-line',
          type: 'line',
          source: 'house',
          paint: {
            'line-color': ['case', ['==', ['get', 'role'], 'buildable'], '#fde68a', '#334155'],
            'line-width': ['case', ['==', ['get', 'role'], 'buildable'], 1.6, 1],
            'line-dasharray': ['case', ['==', ['get', 'role'], 'buildable'], ['literal', [2, 2]], ['literal', [1, 0]]],
          },
        });
        map.addLayer({
          id: 'house-labels',
          type: 'symbol',
          source: 'house',
          minzoom: 19,
          filter: ['==', ['get', 'role'], 'room'],
          layout: {
            'text-field': ['get', 'label'],
            'text-font': FONT,
            'text-size': ['interpolate', ['linear'], ['zoom'], 19, 8, 21, 13],
            'text-rotation-alignment': 'viewport',
            'text-allow-overlap': false,
          },
          paint: { 'text-color': '#1e293b', 'text-halo-color': 'rgba(255,255,255,0.8)', 'text-halo-width': 1 },
        });

        map.addLayer({
          id: 'lot-numbers',
          type: 'symbol',
          source: 'lot-points',
          minzoom: 17.2,
          layout: {
            'text-field': ['get', 'numero'],
            'text-font': FONT_BOLD,
            'text-size': ['interpolate', ['linear'], ['zoom'], 17.2, 10, 20, 18],
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(2,44,34,0.75)',
            'text-halo-width': 1.4,
            'text-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.3, 1],
          },
        });
        map.addLayer({
          id: 'manzana-labels',
          type: 'symbol',
          source: 'manzanas',
          minzoom: 15.3,
          maxzoom: 17.2,
          layout: { 'text-field': ['get', 'name'], 'text-font': FONT_BOLD, 'text-size': 12, 'text-allow-overlap': true },
          paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(2,44,34,0.85)', 'text-halo-width': 1.6 },
        });
        map.addLayer({
          id: 'cad-labels',
          type: 'symbol',
          source: 'labels',
          minzoom: 15.5,
          layout: {
            'text-field': ['get', 'text'],
            'text-font': FONT_BOLD,
            'text-size': [
              'interpolate',
              ['exponential', 2],
              ['zoom'],
              15.5,
              ['*', ['get', 'size'], 0.8],
              18,
              ['*', ['get', 'size'], 2.2],
              20,
              ['*', ['get', 'size'], 7],
            ],
            'text-rotate': ['get', 'angle'],
            'text-rotation-alignment': 'map',
            'text-pitch-alignment': 'map',
            'text-letter-spacing': 0.08,
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': ['match', ['get', 'kind'], 'stage', '#fde68a', '#ffffff'],
            'text-halo-color': 'rgba(2,44,34,0.8)',
            'text-halo-width': 1.4,
          },
        });

        // Interacción
        let hovered: string | null = null;
        const setHoverFeature = (id: string | null) => {
          if (hovered) map.setFeatureState({ source: 'lots', id: hovered }, { hover: false });
          hovered = id;
          if (id) map.setFeatureState({ source: 'lots', id }, { hover: true });
        };
        map.on('mousemove', 'lots-fill', (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id) return;
          map.getCanvas().style.cursor = 'pointer';
          if (id !== hovered) setHoverFeature(id);
          const lot = lotsById.current.get(id);
          if (lot) setHover({ lot, x: e.point.x, y: e.point.y });
        });
        map.on('mouseleave', 'lots-fill', () => {
          map.getCanvas().style.cursor = '';
          setHoverFeature(null);
          setHover(null);
        });
        map.on('click', (e) => {
          const f = map.queryRenderedFeatures(e.point, { layers: ['lots-fill'] })[0];
          onSelectRef.current((f?.properties?.id as string) ?? null);
        });

        // Nombre del proyecto cuando se aleja el mapa (para encontrarlo siempre)
        map.addSource('project-point', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: project.name },
                geometry: { type: 'Point', coordinates: [project.location.lng, project.location.lat] },
              },
            ],
          },
        });
        map.addLayer({
          id: 'project-dot',
          type: 'circle',
          source: 'project-point',
          maxzoom: 15.3,
          paint: { 'circle-radius': 7, 'circle-color': '#10b981', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
        });
        map.addLayer({
          id: 'project-name',
          type: 'symbol',
          source: 'project-point',
          maxzoom: 15.3,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': FONT_BOLD,
            'text-size': 15,
            'text-anchor': 'left',
            'text-offset': [1, 0],
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff', 'text-halo-color': '#047857', 'text-halo-width': 2.2 },
        });

        // Puntos de interés (salidas al mar): se ocultan al alejarse para no tapar el proyecto
        const poiEls: HTMLElement[] = [];
        const syncPois = () => {
          const show = map.getZoom() >= 15;
          for (const el of poiEls) el.style.display = show ? '' : 'none';
        };
        map.on('zoom', syncPois);
        for (const p of project.pois) {
          const el = document.createElement('div');
          el.className =
            'flex items-center gap-1.5 rounded-full bg-sky-500 py-1 pl-1 pr-2.5 text-[11px] font-bold text-white shadow-lg ring-2 ring-white/80';
          el.innerHTML =
            '<span class="grid size-5 place-items-center rounded-full bg-white/25"><svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/></svg></span>' +
            `<span>${p.name}${p.minutes ? ` · ${p.minutes} min` : ''}</span>`;
          new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
          poiEls.push(el);
        }
        syncPois();

        // Etiquetas de OSM por encima de los lotes, pero debajo de los rótulos propios
        for (const id of osmLabelLayers(map)) map.moveLayer(id, 'house-labels');
        applyBase(map, baseRef.current);

        // Mapas de Google (servicio oficial) si hay clave configurada
        if (!googleEnabled) {
          console.info(
            '[Lotes del Caribe] Google Maps DESACTIVADO: la compilación no recibió VITE_GOOGLE_MAPS_KEY. ' +
              'En Cloudflare debe ir en Settings → Build → Build variables (no en "Runtime variables") y luego volver a compilar.',
          );
        } else {
          console.info('[Lotes del Caribe] Google Maps: clave detectada, creando sesión…');
        }
        if (googleEnabled) {
          Promise.all([getSession('roadmap'), getSession('satellite')])
            .then(([roadmap, satellite]) => {
              if (cancelled || !roadmap || !satellite) return;
              sessions.current = { roadmap, satellite };
              console.info('[Lotes del Caribe] Google Maps ACTIVO ✔');
              addGoogleLayers(map, { roadmap: tileUrl(roadmap), satellite: tileUrl(satellite) }, 'greens');
              setProvider('google');
            })
            .catch((err) => {
              console.warn(
                '[Lotes del Caribe] Google Maps RECHAZÓ la sesión (revisa restricciones de la clave y que Map Tiles API esté habilitada). Se usa el mapa gratis. Detalle:',
                String(err),
              );
              clearSessions();
            });
          // Cuota agotada, clave inválida o dominio no autorizado → mapa gratis
          map.on('error', (ev) => {
            const src = (ev as unknown as { sourceId?: string }).sourceId;
            const status = (ev.error as unknown as { status?: number })?.status;
            if (src?.startsWith('g-') && (status === 401 || status === 403 || status === 429)) {
              console.warn(
                `[Lotes del Caribe] Google Maps respondió ${status} al cargar el mapa (clave, dominio o cuota). Se usa el mapa gratis.`,
              );
              clearSessions();
              setProvider('free');
            }
          });
        }

        loadedRef.current = true;
        setLoaded(true);
        pending.current?.();
        pending.current = null;
      });
    };
    buildStyle().then((style) => {
      if (!cancelled) setup(style);
    });

    return () => {
      cancelled = true;
      loadedRef.current = false;
      instance?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.slug]);

  // ------------------------------------------- estados actualizados (panel / datos en vivo)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource('lots') as GeoJSONSource | undefined)?.setData(lotFeatures(project));
  }, [project, loaded]);

  // ------------------------------------------------------------ base layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    applyBase(map, base, provider);
  }, [base, loaded, provider]);

  // ----------------------------------------- derechos de autor de Google (obligatorio)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || provider !== 'google') {
      setCopyright('');
      return;
    }
    let timer = 0;
    let last = '';
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const s = base === 'satellite' ? sessions.current.satellite : sessions.current.roadmap;
        if (!s) return;
        const b = map.getBounds();
        const key = `${base}|${Math.round(map.getZoom())}|${b.getCenter().lng.toFixed(2)}|${b.getCenter().lat.toFixed(2)}`;
        if (key === last) return;
        last = key;
        viewportCopyright(s, map.getZoom(), { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() })
          .then(setCopyright)
          .catch(() => setCopyright('Datos del mapa ©Google'));
      }, 600);
    };
    update();
    map.on('moveend', update);
    return () => {
      window.clearTimeout(timer);
      map.off('moveend', update);
    };
  }, [provider, base, loaded]);

  // ------------------------------------------------------------- selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (prevSel.current) map.setFeatureState({ source: 'lots', id: prevSel.current }, { selected: false });
    if (selectedId) map.setFeatureState({ source: 'lots', id: selectedId }, { selected: true });
    prevSel.current = selectedId;
  }, [selectedId, loaded]);

  // --------------------------------------------------------------- filters
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    for (const l of project.lots) {
      const dim = !visibleIds.has(l.id);
      map.setFeatureState({ source: 'lots', id: l.id }, { dim });
      map.setFeatureState({ source: 'lot-points', id: l.id }, { dim });
    }
  }, [visibleIds, loaded, project]);

  // ----------------------------------------------------------------- house
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource('house') as GeoJSONSource | undefined)?.setData(houseFeatures ?? EMPTY);
  }, [houseFeatures, loaded]);

  // ------------------------------------------------------------------- api
  useImperativeHandle(ref, () => ({
    flyToLot(lot, opts) {
      whenReady(() => {
        const map = mapRef.current;
        if (!map) return;
        const lngs = lot.coords.map((c) => c[0]),
          lats = lot.coords.map((c) => c[1]);
        const cam = map.cameraForBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: paddingRef.current, bearing: opts?.bearing ?? map.getBearing() },
        );
        const zoom = Math.min(opts?.zoom ?? (cam?.zoom ?? 19) - (opts?.bearing != null ? 0.6 : 1.7), 20.5);
        map.flyTo({
          center: cam?.center ?? lot.center,
          zoom,
          bearing: opts?.bearing ?? map.getBearing(),
          duration: 1400,
          essential: true,
          curve: 1.3,
        });
      });
    },
    fitProject() {
      const map = mapRef.current;
      if (!map) return;
      const [w, s, e, n] = project.bounds;
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: { ...paddingRef.current, top: paddingRef.current.top + 40 }, bearing: 0, duration: 1200 },
      );
    },
    flyTo(lng, lat, zoom = 18) {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1400, padding: paddingRef.current });
    },
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    resetNorth: () => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 600 }),
    getMap: () => mapRef.current,
  }));

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
      {provider === 'google' && (
        <div className="pointer-events-none absolute top-[76px] left-3 z-10 flex items-center gap-2 md:top-auto md:bottom-[34px] md:left-[132px]">
          <GoogleLogo light={base === 'satellite'} />
          {copyright && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${base === 'satellite' ? 'bg-black/40 text-white' : 'bg-white/75 text-slate-700'}`}
            >
              {copyright}
            </span>
          )}
        </div>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 hidden -translate-x-1/2 -translate-y-[calc(100%+14px)] md:block"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="glass shadow-soft rounded-xl px-3 py-2 text-xs">
            <div className="text-brand-950 font-bold">
              Lote {hover.lot.numero} · Mz {hover.lot.manzana}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-slate-600">
              <span className="size-2 rounded-full" style={{ background: STATUS[hover.lot.status].color }} />
              {STATUS[hover.lot.status].label} · {m2(hover.lot.area)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

/** Logo de Google exigido al mostrar sus mapas (imagen oficial; texto si no carga). */
function GoogleLogo({ light }: { light: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = light
    ? 'https://maps.gstatic.com/mapfiles/api-3/images/google_white5_hdpi.png'
    : 'https://maps.gstatic.com/mapfiles/api-3/images/google4_hdpi.png';
  if (!failed) return <img src={src} alt="Google" width={66} height={26} className="h-[26px] w-[66px]" onError={() => setFailed(true)} />;
  return (
    <span
      className={`[font-family:Arial,sans-serif] text-[15px] font-medium tracking-tight ${light ? 'text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]' : 'text-slate-600'}`}
    >
      Google
    </span>
  );
}
