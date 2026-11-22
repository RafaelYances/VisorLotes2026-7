import type { StyleSpecification } from 'maplibre-gl';

/**
 * Estilo base: imagen satelital (Esri World Imagery) + mapa vectorial claro (CARTO Voyager)
 * en el mismo estilo, para alternar entre "Satélite" y "Mapa" sin recargar capas.
 */
export const baseStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      // Por encima de z18 Esri no tiene imagen en la zona: se sobre-amplía la de z18
      maxzoom: 18,
      attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
    },
    streets: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: '© OpenStreetMap © CARTO',
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
    {
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      paint: { 'raster-saturation': 0.12, 'raster-contrast': 0.06, 'raster-fade-duration': 250 },
    },
    { id: 'streets', type: 'raster', source: 'streets', layout: { visibility: 'none' } },
    { id: 'places', type: 'raster', source: 'places', paint: { 'raster-opacity': 0.85 } },
  ],
};

export type BaseLayer = 'satellite' | 'streets';

export const FONT = ['Noto Sans Regular'];
export const FONT_BOLD = ['Noto Sans Bold'];
