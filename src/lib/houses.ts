import type { Lot } from '../types';
import { buildableArea, type Buildable } from './geo';

export type RoomKind = 'social' | 'private' | 'service' | 'wet' | 'outdoor' | 'pool' | 'circulation' | 'garden';

export interface Room {
  label: string;
  kind: RoomKind;
  /** metros, origen en la esquina frontal-izquierda de la huella, y hacia el fondo */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HouseDesign {
  id: string;
  name: string;
  style: string;
  floors: number;
  bedrooms: number;
  baths: number;
  /** ancho total de la propuesta (incluye terrazas / piscina) */
  width: number;
  /** profundidad total de la propuesta */
  depth: number;
  builtArea: number;
  description: string;
  accent: string;
  rooms: Room[];
}

/**
 * Catálogo de diseños de referencia (originales).
 * Las medidas están en metros y se dibujan a escala real dentro del lote.
 */
export const HOUSES: HouseDesign[] = [
  {
    id: 'cabana-brisa',
    name: 'Cabaña Brisa',
    style: 'Cabaña tropical',
    floors: 1,
    bedrooms: 2,
    baths: 1,
    width: 7,
    depth: 11.5,
    builtArea: 63,
    accent: '#f59e0b',
    description: 'Compacta y fresca, con terraza frontal para hamacas. Perfecta para alquiler vacacional o fines de semana.',
    rooms: [
      { label: 'Terraza', kind: 'outdoor', x: 0, y: 0, w: 7, h: 2.5 },
      { label: 'Sala · Comedor', kind: 'social', x: 0, y: 2.5, w: 4.2, h: 4.5 },
      { label: 'Cocina', kind: 'service', x: 4.2, y: 2.5, w: 2.8, h: 3 },
      { label: 'Baño', kind: 'wet', x: 4.2, y: 5.5, w: 2.8, h: 1.5 },
      { label: 'Hab. principal', kind: 'private', x: 0, y: 7, w: 3.8, h: 4.5 },
      { label: 'Hab. 2', kind: 'private', x: 3.8, y: 7, w: 3.2, h: 4.5 },
    ],
  },
  {
    id: 'loft-atardecer',
    name: 'Loft Atardecer',
    style: 'Moderno compacto',
    floors: 2,
    bedrooms: 2,
    baths: 2,
    width: 6,
    depth: 13,
    builtArea: 108,
    accent: '#8b5cf6',
    description: 'Dos niveles en huella mínima: social abajo, habitaciones y balcón arriba. Ideal para lotes de frente angosto.',
    rooms: [
      { label: 'Acceso', kind: 'outdoor', x: 0, y: 0, w: 6, h: 1.5 },
      { label: 'Sala · Cocina', kind: 'social', x: 0, y: 1.5, w: 6, h: 5 },
      { label: 'Baño', kind: 'wet', x: 0, y: 6.5, w: 2.2, h: 2 },
      { label: 'Ropas', kind: 'service', x: 0, y: 8.5, w: 2.2, h: 2 },
      { label: 'Escalera', kind: 'circulation', x: 2.2, y: 6.5, w: 1.4, h: 4 },
      { label: 'Estudio', kind: 'private', x: 3.6, y: 6.5, w: 2.4, h: 4 },
      { label: 'Patio', kind: 'garden', x: 0, y: 10.5, w: 6, h: 2.5 },
    ],
  },
  {
    id: 'casa-palmera',
    name: 'Casa Palmera',
    style: 'Campestre contemporánea',
    floors: 1,
    bedrooms: 3,
    baths: 2,
    width: 10,
    depth: 14.5,
    builtArea: 120,
    accent: '#10b981',
    description: 'Una sola planta, espacios amplios y ventilación cruzada. La favorita para vivir en familia junto al mar.',
    rooms: [
      { label: 'Terraza', kind: 'outdoor', x: 0, y: 0, w: 10, h: 2.5 },
      { label: 'Sala', kind: 'social', x: 0, y: 2.5, w: 5.5, h: 5 },
      { label: 'Cocina · Comedor', kind: 'service', x: 5.5, y: 2.5, w: 4.5, h: 5 },
      { label: 'Circulación', kind: 'circulation', x: 0, y: 7.5, w: 10, h: 1.2 },
      { label: 'Hab. principal', kind: 'private', x: 0, y: 8.7, w: 4.2, h: 5.8 },
      { label: 'Baño', kind: 'wet', x: 4.2, y: 8.7, w: 1.8, h: 2.6 },
      { label: 'Baño', kind: 'wet', x: 4.2, y: 11.3, w: 1.8, h: 3.2 },
      { label: 'Hab. 2', kind: 'private', x: 6, y: 8.7, w: 4, h: 2.9 },
      { label: 'Hab. 3', kind: 'private', x: 6, y: 11.6, w: 4, h: 2.9 },
    ],
  },
  {
    id: 'villa-coral',
    name: 'Villa Coral',
    style: 'Villa de playa',
    floors: 2,
    bedrooms: 4,
    baths: 3,
    width: 9.5,
    depth: 15,
    builtArea: 171,
    accent: '#0ea5e9',
    description: 'Dos plantas con piscina y deck posterior. Social en primer piso, cuatro alcobas en total. (Se muestra la planta baja).',
    rooms: [
      { label: 'Porche', kind: 'outdoor', x: 0, y: 0, w: 9.5, h: 1.5 },
      { label: 'Sala · Comedor', kind: 'social', x: 0, y: 1.5, w: 5.5, h: 5.5 },
      { label: 'Cocina', kind: 'service', x: 5.5, y: 1.5, w: 4, h: 3.5 },
      { label: 'Baño', kind: 'wet', x: 5.5, y: 5, w: 1.8, h: 2 },
      { label: 'Escalera', kind: 'circulation', x: 7.3, y: 5, w: 2.2, h: 2 },
      { label: 'Hab. huéspedes', kind: 'private', x: 0, y: 7, w: 4.5, h: 3.5 },
      { label: 'Estudio', kind: 'private', x: 4.5, y: 7, w: 5, h: 3.5 },
      { label: 'Deck', kind: 'outdoor', x: 0, y: 10.5, w: 9.5, h: 4.5 },
      { label: 'Piscina', kind: 'pool', x: 2, y: 11.7, w: 5.5, h: 3 },
    ],
  },
  {
    id: 'mar-abierto',
    name: 'Casa Mar Abierto',
    style: 'Premium de una planta',
    floors: 1,
    bedrooms: 3,
    baths: 3,
    width: 12,
    depth: 16,
    builtArea: 150,
    accent: '#ec4899',
    description: 'Gran formato con piscina y deck. Requiere un lote amplio o la unión de dos lotes contiguos.',
    rooms: [
      { label: 'Terraza', kind: 'outdoor', x: 0, y: 0, w: 12, h: 2 },
      { label: 'Sala', kind: 'social', x: 0, y: 2, w: 6.5, h: 5.5 },
      { label: 'Cocina · Comedor', kind: 'service', x: 6.5, y: 2, w: 5.5, h: 5.5 },
      { label: 'Hab. principal', kind: 'private', x: 0, y: 7.5, w: 4.5, h: 4.5 },
      { label: 'Baño', kind: 'wet', x: 4.5, y: 7.5, w: 2, h: 2.5 },
      { label: 'Vestier', kind: 'service', x: 4.5, y: 10, w: 2, h: 2 },
      { label: 'Hab. 2', kind: 'private', x: 6.5, y: 7.5, w: 3.5, h: 4.5 },
      { label: 'Baño', kind: 'wet', x: 10, y: 7.5, w: 2, h: 2.25 },
      { label: 'Baño', kind: 'wet', x: 10, y: 9.75, w: 2, h: 2.25 },
      { label: 'Hab. 3', kind: 'private', x: 0, y: 12, w: 4.5, h: 4 },
      { label: 'Deck', kind: 'outdoor', x: 4.5, y: 12, w: 7.5, h: 4 },
      { label: 'Piscina', kind: 'pool', x: 5.3, y: 12.5, w: 5.9, h: 3 },
    ],
  },
];

export const ROOM_STYLE: Record<RoomKind, { fill: string; text: string }> = {
  social: { fill: '#fef3c7', text: '#92400e' },
  private: { fill: '#e0e7ff', text: '#3730a3' },
  service: { fill: '#ffedd5', text: '#9a3412' },
  wet: { fill: '#cffafe', text: '#155e75' },
  outdoor: { fill: '#f5e6d3', text: '#78350f' },
  pool: { fill: '#38bdf8', text: '#ffffff' },
  circulation: { fill: '#f1f5f9', text: '#475569' },
  garden: { fill: '#bbf7d0', text: '#166534' },
};

export interface Fit {
  fits: boolean;
  /** diseño efectivo (puede venir girado 90° para aprovechar lotes anchos) */
  house: HouseDesign;
  rotated: boolean;
  buildable: Buildable;
  /** posición de la casa en coordenadas locales del lote */
  x: number;
  y: number;
  occupation: number; // % del lote ocupado por la huella
  missingWidth: number;
  missingDepth: number;
}

/** Gira el diseño 90° (el acceso queda mirando a un lateral). */
export function rotateHouse(h: HouseDesign): HouseDesign {
  return {
    ...h,
    width: h.depth,
    depth: h.width,
    rooms: h.rooms.map((r) => ({ ...r, x: r.y, y: h.width - (r.x + r.w), w: r.h, h: r.w })),
  };
}

function place(lot: Lot, house: HouseDesign, b: Buildable, rotated: boolean): Fit {
  const missingWidth = Math.max(0, house.width - b.w);
  const missingDepth = Math.max(0, house.depth - b.h);
  const footprint = house.rooms
    .filter((r) => r.kind !== 'pool' && r.kind !== 'garden' && r.kind !== 'outdoor')
    .reduce((s, r) => s + r.w * r.h, 0);
  return {
    fits: missingWidth < 0.01 && missingDepth < 0.01,
    house,
    rotated,
    buildable: b,
    x: b.x + (b.w - house.width) / 2,
    y: b.y,
    occupation: (footprint / lot.area) * 100,
    missingWidth,
    missingDepth,
  };
}

export function fitHouse(lot: Lot, house: HouseDesign, setbacks: { front: number; back: number; side: number }): Fit {
  const b = buildableArea(lot, setbacks);
  const straight = place(lot, house, b, false);
  if (straight.fits) return straight;
  const turned = place(lot, rotateHouse(house), b, true);
  if (turned.fits) return turned;
  return straight;
}
