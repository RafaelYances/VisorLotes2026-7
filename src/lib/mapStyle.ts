import type { LayerSpecification, Map as MLMap, StyleSpecification } from 'maplibre-gl';

/**
 * Mapas base
 * - "Mapa": OpenFreeMap (estilo Liberty, datos de OpenStreetMap). Gratis, sin clave y con uso comercial permitido.
 * - "Satélite": Esri World Imagery con las etiquetas de OpenStreetMap encima (vista híbrida):
 *   nombres de veredas, playas, vías, negocios… para que el cliente siempre se ubique.
 * Si OpenFreeMap no responde, se usa un estilo de respaldo con capas raster de Esri.
 */
const LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export type BaseLayer = 'satellite' | 'streets';
export const FONT = ['Noto Sans Regular'];
export const FONT_BOLD = ['Noto Sans Bold'];

type Group = 'osm-base' | 'osm-label' | 'osm-road' | 'satellite' | 'fb-streets' | 'fb-places';
const GROUP = 'vl:group';

const satelliteSource = {
  type: 'raster' as const,
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  // Por encima de z18 Esri no tiene imagen en la zona: se sobre-amplía la de z18
  maxzoom: 18,
  attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
};

const satelliteLayer: LayerSpecification = {
  id: 'satellite',
  type: 'raster',
  source: 'satellite',
  metadata: { [GROUP]: 'satellite' },
  paint: { 'raster-saturation': 0.12, 'raster-contrast': 0.06, 'raster-fade-duration': 250 },
};

/** Vías de OSM que se dibujan suavemente sobre el satélite (como en la vista híbrida de Google). */
const HYBRID_ROADS = new Set(['road_motorway', 'road_trunk_primary', 'road_secondary_tertiary', 'road_minor', 'road_link']);

/** Nombres en español cuando existan; si no, el nombre local. */
const NAME = ['coalesce', ['get', 'name:es'], ['get', 'name:latin'], ['get', 'name']];
const usesName = (v: unknown) => JSON.stringify(v ?? '').includes('name');

/** Estilo de respaldo (solo raster Esri) por si OpenFreeMap no está disponible. */
export const fallbackStyle: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    satellite: satelliteSource,
    streets: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Mapa © Esri, HERE, Garmin, © OpenStreetMap',
    },
    places: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b2b22' } },
    { id: 'fb-streets', type: 'raster', source: 'streets', metadata: { [GROUP]: 'fb-streets' }, layout: { visibility: 'none' } },
    satelliteLayer,
    { id: 'fb-places', type: 'raster', source: 'places', metadata: { [GROUP]: 'fb-places' }, paint: { 'raster-opacity': 0.85 } },
  ],
};

let cached: Promise<StyleSpecification> | null = null;

/** Construye el estilo combinado (OSM vectorial + satélite). */
export function buildStyle(): Promise<StyleSpecification> {
  cached ??= fetch(LIBERTY)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<StyleSpecification>;
    })
    .then((lib) => {
      const base: LayerSpecification[] = [];
      const hybridRoads: LayerSpecification[] = [];
      const labels: LayerSpecification[] = [];
      for (const l of lib.layers) {
        if (l.type === 'symbol') {
          const layout = { ...l.layout } as Record<string, unknown>;
          if (usesName(layout['text-field']) && !JSON.stringify(layout['text-field']).includes('"ref"')) layout['text-field'] = NAME;
          labels.push({ ...l, layout, metadata: { [GROUP]: 'osm-label' } } as LayerSpecification);
        } else {
          base.push({ ...l, metadata: { [GROUP]: 'osm-base' } } as LayerSpecification);
          // Copia translúcida de las vías principales para dibujarlas sobre el satélite
          if (HYBRID_ROADS.has(l.id) && l.type === 'line')
            hybridRoads.push({
              ...l,
              id: `hy-${l.id}`,
              metadata: { [GROUP]: 'osm-road' },
              paint: { ...l.paint, 'line-opacity': 0.4 },
            } as LayerSpecification);
        }
      }
      return {
        ...lib,
        glyphs: GLYPHS,
        sources: { ...lib.sources, satellite: satelliteSource },
        layers: [...base, satelliteLayer, ...hybridRoads, ...labels],
      } as StyleSpecification;
    })
    .catch((e) => {
      console.warn('OpenFreeMap no disponible, se usa el mapa de respaldo', e);
      cached = null;
      return fallbackStyle;
    });
  return cached;
}

const groupOf = (l: LayerSpecification) => (l.metadata as Record<string, Group> | undefined)?.[GROUP];

/** Ids de las capas de etiquetas de OSM (para dejarlas por encima de los lotes). */
export const osmLabelLayers = (map: MLMap) =>
  map
    .getStyle()
    .layers.filter((l) => groupOf(l) === 'osm-label')
    .map((l) => l.id);

const originals = new WeakMap<MLMap, Map<string, Record<string, unknown>>>();

/** Cambia entre "Satélite" (híbrido) y "Mapa". */
export function applyBase(map: MLMap, base: BaseLayer) {
  const sat = base === 'satellite';
  let store = originals.get(map);
  if (!store) originals.set(map, (store = new Map()));
  const save = (id: string, prop: string) => {
    const key = `${id}|${prop}`;
    if (!store!.has(key)) store!.set(key, { v: map.getPaintProperty(id, prop) });
    return store!.get(key)!.v;
  };
  const setPaint = (id: string, prop: string, satValue: unknown) => {
    const original = save(id, prop);
    map.setPaintProperty(id, prop, sat ? satValue : original);
  };

  for (const l of map.getStyle().layers) {
    const g = groupOf(l);
    if (!g) continue;
    const vis = (v: boolean) => map.setLayoutProperty(l.id, 'visibility', v ? 'visible' : 'none');
    if (g === 'osm-base' || g === 'fb-streets') vis(!sat);
    else if (g === 'satellite' || g === 'fb-places' || g === 'osm-road') vis(sat);
    else if (g === 'osm-label' && l.type === 'symbol') {
      // Sobre el satélite: texto blanco con halo oscuro (como en la vista híbrida)
      setPaint(l.id, 'text-color', '#ffffff');
      setPaint(l.id, 'text-halo-color', 'rgba(0,0,0,0.85)');
      setPaint(l.id, 'text-halo-width', 1.6);
    }
  }
}
