import type { Lot, LngLat, Project } from '../types';

/** Convierte un punto local del lote (metros) a lng/lat usando el marco del lote y el afín del proyecto. */
export function localToLngLat(project: Project, lot: Lot, x: number, y: number): LngLat {
  const { o, ux, uy } = lot.frame;
  const E = o[0] + ux[0] * x + uy[0] * y;
  const N = o[1] + ux[1] * x + uy[1] * y;
  const A = project.affine;
  const dE = E - A.e0,
    dN = N - A.n0;
  return [A.lng0 + A.a * dE + A.b * dN, A.lat0 + A.c * dE + A.d * dN];
}

export function rectToRing(project: Project, lot: Lot, x: number, y: number, w: number, h: number): LngLat[] {
  const pts: [number, number][] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
  return pts.map(([px, py]) => localToLngLat(project, lot, px, py));
}

/** Ángulo (grados, sentido horario desde arriba) del norte dentro del plano local del lote. */
export function northAngle(lot: Lot) {
  // Norte en UTM = (0,1). En coordenadas locales: (ux·N, uy·N) = (ux[1], uy[1])
  const nx = lot.frame.ux[1],
    ny = lot.frame.uy[1];
  // En el plano (SVG), y local apunta hacia arriba. Ángulo desde "arriba" en sentido horario:
  return (Math.atan2(nx, ny) * 180) / Math.PI;
}

/** Rumbo (bearing) del eje "fondo" del lote, para orientar el mapa mirando el lote desde la vía. */
export function lotBearing(lot: Lot) {
  const [ex, ny] = lot.frame.uy; // dirección del fondo en UTM (este, norte)
  return (Math.atan2(ex, ny) * 180) / Math.PI;
}

/** Ancho útil x(y) del polígono local a una profundidad dada. */
function spanAt(poly: [number, number][], y: number) {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
  }
  if (xs.length < 2) return null;
  return [Math.min(...xs), Math.max(...xs)] as const;
}

export interface Buildable {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mayor rectángulo construible (respetando retiros) alineado con el frente del lote. */
export function buildableArea(lot: Lot, setbacks: { front: number; back: number; side: number }): Buildable {
  const y0 = setbacks.front;
  const y1 = lot.fondo - setbacks.back;
  let left = -Infinity,
    right = Infinity;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    const s = spanAt(lot.local, Math.min(Math.max(y, 0.01), lot.fondo - 0.01));
    if (!s) continue;
    left = Math.max(left, s[0]);
    right = Math.min(right, s[1]);
  }
  const x = left + setbacks.side;
  const w = Math.max(0, right - setbacks.side - x);
  return { x, y: y0, w, h: Math.max(0, y1 - y0) };
}
