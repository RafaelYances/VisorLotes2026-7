export type LotStatus = 'available' | 'reserved' | 'sold';
export type LngLat = [number, number];

export interface Side {
  role: 'frente' | 'fondo' | 'izquierdo' | 'derecho';
  length: number;
  colinda: string;
}

export interface Lot {
  id: string;
  manzana: string;
  numero: string;
  status: LotStatus;
  price: number | null;
  area: number;
  perimeter: number;
  frente: number;
  fondo: number;
  sides: Side[];
  center: LngLat;
  coords: LngLat[];
  /** Polígono en metros: x a lo largo del frente, y hacia el fondo (0 = vía). */
  local: [number, number][];
  /** Marco local → UTM: P = o + ux·x + uy·y */
  frame: { o: [number, number]; ux: [number, number]; uy: [number, number] };
}

export interface ProjectStats {
  total: number;
  available: number;
  reserved: number;
  sold: number;
  areaMin: number;
  areaMax: number;
  areaTotal: number;
  manzanas: number;
}

export interface ProjectLocation {
  city: string;
  region: string;
  lat: number;
  lng: number;
  mapsUrl?: string;
}

export interface Highlight {
  icon: string;
  title: string;
  text: string;
}

export interface GalleryItem {
  /** id en la base de datos (si se gestiona desde el panel) */
  id?: string;
  cover?: boolean;
  type: 'image' | 'video';
  src: string;
  /** miniatura (fotos, o portada del video si existe) */
  thumb?: string;
  poster?: string;
  w?: number;
  h?: number;
  /** vista previa borrosa (data URI) */
  blur?: string;
  caption: string;
  sizeMB?: number;
}

export interface ProjectCard {
  slug: string;
  name: string;
  tagline: string;
  status: string;
  location: ProjectLocation;
  logo: string | null;
  stats: ProjectStats;
  bounds: [number, number, number, number];
  preview: { w: number; h: number; lots: { id: string; d: string; s: LotStatus }[] };
  cover: { src: string; thumb: string; blur: string } | null;
  media: { photos: number; videos: number };
}

export interface Project {
  /** Solo en vista previa del administrador: el proyecto está oculto al público. */
  preview?: boolean;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  status: string;
  location: ProjectLocation;
  logo?: string;
  contact: { whatsapp: string; phoneLabel: string };
  currency: string;
  highlights: Highlight[];
  setbacks: { front: number; back: number; side: number };
  rounding?: 'exact' | 'plano';
  bounds: [number, number, number, number];
  stats: ProjectStats;
  affine: { e0: number; n0: number; lng0: number; lat0: number; a: number; b: number; c: number; d: number };
  lots: Lot[];
  manzanas: { name: string; area: number; center: LngLat; coords: LngLat[] }[];
  roads: LngLat[][];
  greens: LngLat[][];
  labels: { text: string; lng: number; lat: number; angle: number; kind: string; size: number }[];
  pois: { type: string; name: string; lng: number; lat: number; minutes: number | null }[];
  gallery: GalleryItem[];
}
