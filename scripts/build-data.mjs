#!/usr/bin/env node
/**
 * Convierte los planos (DXF) y las listas de precios/estados (Excel) de cada
 * proyecto en archivos JSON livianos que consume la aplicación web.
 *
 *   data/projects/<slug>/project.json   → ficha del proyecto (nombre, contacto, retiros…)
 *   data/projects/<slug>/plano.dxf      → plano en coordenadas UTM
 *   data/projects/<slug>/lotes.xlsx     → (opcional) Cod. Lote | Área | Manzano | Precio | Estado
 *
 * Salida:
 *   public/data/projects.json           → catálogo para la página de inicio
 *   public/data/projects/<slug>.json    → todo lo necesario para el visor
 *
 * Convenciones de capas del DXF:
 *   "Lote <manzana> <número>"  → lote (polilínea cerrada)
 *   "Mz.<manzana>"             → manzana
 *   "AREA VIAL"                → vías
 *   "AREA VERDE"               → zonas verdes
 *   TEXT/MTEXT                 → rótulos (los números de lote y "Mz.x" se ignoran)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import DxfParser from 'dxf-parser';
import proj4 from 'proj4';
import ExcelJS from 'exceljs';
import { buildGallery } from './gallery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'projects');
const OUT = path.join(ROOT, 'public', 'data');

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------- geometría
function bulgeArc(a, b, bulge, segments = 24) {
  // Devuelve puntos intermedios (sin extremos) de un arco definido por "bulge".
  const theta = 4 * Math.atan(bulge);
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return [];
  const r = chord / (2 * Math.sin(theta / 2));
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2;
  const h = r * Math.cos(theta / 2);
  const nx = -dy / chord,
    ny = dx / chord;
  const cx = mx + nx * h,
    cy = my + ny * h;
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  const R = Math.hypot(a.x - cx, a.y - cy);
  const pts = [];
  for (let i = 1; i < segments; i++) {
    const t = a0 + (theta * i) / segments;
    pts.push({ x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) });
  }
  return pts;
}

function ringFromEntity(e) {
  const v = e.vertices || [];
  const pts = [];
  const closed = e.shape || e.closed;
  const n = closed ? v.length : v.length - 1;
  for (let i = 0; i < n; i++) {
    const a = v[i],
      b = v[(i + 1) % v.length];
    if (i === 0) pts.push({ x: a.x, y: a.y });
    if (a.bulge && Math.abs(a.bulge) > 1e-4) pts.push(...bulgeArc(a, b, a.bulge));
    pts.push({ x: b.x, y: b.y });
  }
  return dedupe(pts);
}

function dedupe(pts, eps = 0.001) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > eps) out.push(p);
  }
  if (out.length > 2) {
    const f = out[0],
      l = out[out.length - 1];
    if (Math.hypot(f.x - l.x, f.y - l.y) <= eps) out.pop();
  }
  return out;
}

/** Quita vértices colineales (deja solo las esquinas reales). */
function simplifyCollinear(pts, tolDeg = 1.5) {
  if (pts.length <= 3) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[(i - 1 + pts.length) % pts.length],
      c = pts[i],
      n = pts[(i + 1) % pts.length];
    const a1 = Math.atan2(c.y - p.y, c.x - p.x),
      a2 = Math.atan2(n.y - c.y, n.x - c.x);
    let d = Math.abs(a2 - a1) * (180 / Math.PI);
    if (d > 180) d = 360 - d;
    if (d > tolDeg) out.push(c);
  }
  return out.length >= 3 ? out : pts;
}

const signedArea = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};
const area = (pts) => Math.abs(signedArea(pts));
const perimeter = (pts) => pts.reduce((s, p, i) => s + dist(p, pts[(i + 1) % pts.length]), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const centroid = (pts) => {
  let x = 0,
    y = 0,
    A = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const f = a.x * b.y - b.x * a.y;
    x += (a.x + b.x) * f;
    y += (a.y + b.y) * f;
    A += f;
  }
  A /= 2;
  if (Math.abs(A) < 1e-9) return pts[0];
  return { x: x / (6 * A), y: y / (6 * A) };
};

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
const distToRing = (p, ring) => ring.reduce((m, a, i) => Math.min(m, distToSegment(p, a, ring[(i + 1) % ring.length])), Infinity);

/** Rectángulo mínimo envolvente (rotating calipers sobre las aristas). */
function minRect(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const L = dist(a, b);
    if (L < 1e-6) continue;
    const ux = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const uy = { x: -ux.y, y: ux.x };
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of pts) {
      const px = p.x * ux.x + p.y * ux.y,
        py = p.x * uy.x + p.y * uy.y;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    const A = (maxX - minX) * (maxY - minY);
    if (!best || A < best.A - 1e-6) best = { A, ux, uy, minX, maxX, minY, maxY };
  }
  return best;
}

// ------------------------------------------------------------------ excel
async function readExcel(file) {
  if (!fs.existsSync(file)) return new Map();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const header = [];
  ws.getRow(1).eachCell((c, i) => (header[i] = String(c.value ?? '').toLowerCase()));
  const col = (re) => header.findIndex((h) => h && re.test(h));
  const cCode = col(/lote|c[oó]d/),
    cPrice = col(/precio|valor/),
    cStatus = col(/estado/);
  const map = new Map();
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const code = row.getCell(cCode).value;
    if (!code) return;
    const key = normalizeLotKey(String(code));
    if (!key) return;
    const rawStatus = String(row.getCell(cStatus).value ?? '').toLowerCase();
    const status = rawStatus.includes('vend') ? 'sold' : rawStatus.includes('reserv') ? 'reserved' : 'available';
    const rawPrice = row.getCell(cPrice).value;
    const price = typeof rawPrice === 'number' ? rawPrice : Number(String(rawPrice ?? '').replace(/[^\d]/g, '')) || null;
    map.set(key, { status, price });
  });
  return map;
}

/** "LOTE 3 2", "Lote 3 2", "Lote A 7" → "3-2", "A-7" */
function normalizeLotKey(name) {
  const m = name.trim().match(/^lote\s+(\S+)\s+(\S+)$/i);
  return m ? `${m[1].toUpperCase()}-${m[2].toUpperCase()}` : null;
}

// --------------------------------------------------------------- proyecto
async function buildProject(slug) {
  const dir = path.join(SRC, slug);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  const dxf = new DxfParser().parseSync(fs.readFileSync(path.join(dir, 'plano.dxf'), 'utf8'));
  const prices = await readExcel(path.join(dir, 'lotes.xlsx'));

  const { zone = 18, hemisphere = 'north' } = meta.cad || {};
  const utm = `+proj=utm +zone=${zone} ${hemisphere === 'south' ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;
  const toLL = (p) => {
    const [lng, lat] = proj4(utm, 'WGS84', [p.x, p.y]);
    return [round(lng, 7), round(lat, 7)];
  };

  const lotsRaw = new Map();
  const manzanas = new Map();
  const roads = [],
    greens = [],
    texts = [];

  for (const e of dxf.entities) {
    const layer = (e.layer || '').trim();
    if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      const ring = ringFromEntity(e);
      if (ring.length < 3) continue;
      const key = normalizeLotKey(layer);
      if (key) {
        const prev = lotsRaw.get(key);
        if (!prev || area(ring) > area(prev.ring)) lotsRaw.set(key, { ring, layer });
      } else if (/^mz\.?/i.test(layer) || /manzan/i.test(layer)) {
        const name = layer
          .replace(/^mz\.?|manzano|manzana/gi, '')
          .trim()
          .toUpperCase();
        const prev = manzanas.get(name);
        if (!prev || area(ring) > area(prev)) manzanas.set(name, ring);
      } else if (/area vial/i.test(layer)) roads.push(ring);
      else if (/area verde/i.test(layer)) greens.push(ring);
    } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const raw = String(e.text || '')
        .replace(/\\P/g, ' ')
        .replace(/\{|\}/g, '')
        .trim();
      if (!raw || /^\d+$/.test(raw) || /^mz\.?\s*\S+$/i.test(raw) || raw.includes('\\A')) continue;
      const pos = e.startPoint || e.position;
      if (!pos) continue;
      const h = e.textHeight || e.height || 2;
      const rot = e.rotation || 0;
      const text = raw
        .replace(/^[-<>\s]+/, '')
        .replace(/[-<>\s]+$/, '')
        .trim();
      const w = text.length * h * 0.62;
      const r = (rot * Math.PI) / 180;
      const c =
        e.type === 'TEXT'
          ? { x: pos.x + (Math.cos(r) * w) / 2 - (Math.sin(r) * h) / 2, y: pos.y + (Math.sin(r) * w) / 2 + (Math.cos(r) * h) / 2 }
          : pos;
      texts.push({ text, c, h, rot });
    }
  }

  // Ángulo legible (nunca de cabeza)
  const readable = (deg) => {
    let a = ((deg % 360) + 360) % 360;
    if (a > 90 && a <= 270) a -= 180;
    if (a > 180) a -= 360;
    return a;
  };
  const kindOf = (t) =>
    /salida al mar/i.test(t)
      ? 'beach'
      : /etapa/i.test(t)
        ? 'stage'
        : /minuto|caminando/i.test(t)
          ? 'note'
          : /v[ií]a|troncal|calle|carrera/i.test(t)
            ? 'road'
            : 'other';

  const labels = texts.map((t) => {
    const [lng, lat] = toLL(t.c);
    return { text: t.text, lng, lat, angle: round(-readable(t.rot), 1), kind: kindOf(t.text), size: round(t.h, 1) };
  });

  // Puntos de interés: salidas al mar + su nota "A solo X minutos"
  const pois = [];
  for (const t of texts.filter((t) => kindOf(t.text) === 'beach')) {
    const note = texts.filter((n) => kindOf(n.text) === 'note').sort((a, b) => dist(a.c, t.c) - dist(b.c, t.c))[0];
    const [lng, lat] = toLL(t.c);
    const minutes = note && dist(note.c, t.c) < 60 ? Number((note.text.match(/(\d+)\s*min/i) || [])[1]) || null : null;
    pois.push({ type: 'beach', name: t.text.replace(/salida al mar/i, 'Salida al mar').trim(), lng, lat, minutes });
  }

  const allRoadRings = roads;
  const manzanaRings = [...manzanas.values()];
  const lotEntries = [...lotsRaw.entries()];

  // ---- lotes
  const lots = lotEntries.map(([id, { ring: rawRing }]) => {
    const ring = simplifyCollinear(rawRing);
    const [mz, num] = id.split('-');
    const A = area(rawRing);
    const rect = minRect(ring);
    // Distancia de un punto a la vía (o, si no hay vías, al borde de la manzana)
    const roadDist = (pt) => (allRoadRings.length ? Math.min(...allRoadRings.map((r) => distToRing(pt, r))) : Infinity);
    const mzDist = (pt) => (manzanaRings.length ? Math.min(...manzanaRings.map((r) => distToRing(pt, r))) : Infinity);

    // Probar los 4 lados del rectángulo envolvente como posible "frente".
    // d = dirección desde el frente hacia el fondo; x = d rotado -90° (marco dextrógiro).
    const neg = (v) => ({ x: -v.x, y: -v.y });
    const candidates = [rect.ux, neg(rect.ux), rect.uy, neg(rect.uy)].map((d) => {
      const xAxis = { x: d.y, y: -d.x };
      const px = ring.map((p) => p.x * xAxis.x + p.y * xAxis.y);
      const py = ring.map((p) => p.x * d.x + p.y * d.y);
      const minX = Math.min(...px),
        maxX = Math.max(...px),
        minY = Math.min(...py),
        maxY = Math.max(...py);
      const mx = (minX + maxX) / 2;
      const mid = { x: xAxis.x * mx + d.x * minY, y: xAxis.y * mx + d.y * minY };
      return { d, xAxis, frente: maxX - minX, fondo: maxY - minY, road: roadDist(mid), mz: mzDist(mid) };
    });
    const ROAD_TOL = 2;
    const short = (c) => c.frente <= c.fondo + 0.01;
    const best = (list, key) => list.slice().sort((a, b) => a[key] - b[key])[0];
    const onRoad = candidates.filter((c) => c.road < ROAD_TOL);
    const pick =
      best(onRoad.filter(short), 'road') || // lado corto sobre la vía (caso típico)
      best(onRoad, 'road') || // lote que da a la vía por su lado largo
      best(candidates.filter(short), 'mz') || // sin vías: lado corto sobre el borde de manzana
      candidates[0];
    const uX = pick.xAxis,
      uY = pick.d;
    const lenX = pick.frente,
      lenY = pick.fondo;
    const L = ring.map((p) => ({ x: p.x * uX.x + p.y * uX.y, y: p.x * uY.x + p.y * uY.y }));
    const lx0 = Math.min(...L.map((p) => p.x)),
      ly0 = Math.min(...L.map((p) => p.y));
    const local = L.map((p) => [round(p.x - lx0, 3), round(p.y - ly0, 3)]);
    // origen del marco local en UTM
    const origin = { x: uX.x * lx0 + uY.x * ly0, y: uX.y * lx0 + uY.y * ly0 };

    // Lados con nombre y colindancia
    const sides = ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const la = local[i],
        lb = local[(i + 1) % local.length];
      const mid = { x: (la[0] + lb[0]) / 2, y: (la[1] + lb[1]) / 2 };
      const dxL = lb[0] - la[0],
        dyL = lb[1] - la[1];
      const role = Math.abs(dyL) < Math.abs(dxL) ? (mid.y < lenY / 2 ? 'frente' : 'fondo') : mid.x < lenX / 2 ? 'izquierdo' : 'derecho';
      // punto 1 m hacia afuera
      const len = dist(a, b);
      const nx = (b.y - a.y) / len,
        ny = -(b.x - a.x) / len;
      const s = signedArea(ring) > 0 ? 1 : -1; // CCW → normal exterior = (dy,-dx)
      const out = { x: (a.x + b.x) / 2 + nx * s * 1.0, y: (a.y + b.y) / 2 + ny * s * 1.0 };
      let colinda = 'Lindero';
      const neighbor = lotEntries.find(([oid, o]) => oid !== id && pointInPolygon(out, o.ring));
      if (neighbor) colinda = `Lote ${neighbor[0].split('-')[1]} · Mz ${neighbor[0].split('-')[0]}`;
      else if (allRoadRings.some((r) => pointInPolygon(out, r) || distToRing(out, r) < 1.2)) colinda = 'Vía';
      else if (greens.some((r) => pointInPolygon(out, r))) colinda = 'Zona verde';
      return { role, length: round(len), colinda };
    });

    const info = prices.get(id) || { status: 'available', price: null };
    const c = centroid(ring);
    return {
      id,
      manzana: mz,
      numero: num,
      status: info.status,
      price: info.price,
      area: round(A),
      perimeter: round(perimeter(rawRing)),
      frente: round(lenX),
      fondo: round(lenY),
      sides,
      center: toLL(c),
      coords: rawRing.map(toLL),
      local,
      frame: { o: [round(origin.x, 3), round(origin.y, 3)], ux: [round(uX.x, 6), round(uX.y, 6)], uy: [round(uY.x, 6), round(uY.y, 6)] },
    };
  });

  const sortKey = (v) => (/^\d+$/.test(v) ? v.padStart(4, '0') : v);
  lots.sort((a, b) => sortKey(a.manzana).localeCompare(sortKey(b.manzana)) || Number(a.numero) - Number(b.numero));

  // Afín UTM → lng/lat (para colocar diseños de casas sobre el mapa sin proj4 en el navegador)
  const all = lots.flatMap((l) => l.coords);
  const c0 = lots.length ? centroid(lotEntries[0][1].ring) : { x: 0, y: 0 };
  const p0 = proj4(utm, 'WGS84', [c0.x, c0.y]);
  const pE = proj4(utm, 'WGS84', [c0.x + 100, c0.y]);
  const pN = proj4(utm, 'WGS84', [c0.x, c0.y + 100]);
  const affine = {
    e0: round(c0.x, 3),
    n0: round(c0.y, 3),
    lng0: p0[0],
    lat0: p0[1],
    a: (pE[0] - p0[0]) / 100,
    b: (pN[0] - p0[0]) / 100,
    c: (pE[1] - p0[1]) / 100,
    d: (pN[1] - p0[1]) / 100,
  };

  const lngs = all.map((p) => p[0]),
    lats = all.map((p) => p[1]);
  const bounds = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];

  const stats = {
    total: lots.length,
    available: lots.filter((l) => l.status === 'available').length,
    reserved: lots.filter((l) => l.status === 'reserved').length,
    sold: lots.filter((l) => l.status === 'sold').length,
    areaMin: lots.length ? Math.min(...lots.map((l) => l.area)) : 0,
    areaMax: lots.length ? Math.max(...lots.map((l) => l.area)) : 0,
    areaTotal: round(lots.reduce((s, l) => s + l.area, 0)),
    manzanas: manzanas.size,
  };

  // Vista previa SVG para las tarjetas del inicio (coordenadas en metros, y invertida)
  const minE = Math.min(...lotEntries.flatMap(([, l]) => l.ring.map((p) => p.x)));
  const maxN = Math.max(...lotEntries.flatMap(([, l]) => l.ring.map((p) => p.y)));
  const maxE = Math.max(...lotEntries.flatMap(([, l]) => l.ring.map((p) => p.x)));
  const minN = Math.min(...lotEntries.flatMap(([, l]) => l.ring.map((p) => p.y)));
  const toSvg = (r) => 'M' + r.map((p) => `${round(p.x - minE, 1)} ${round(maxN - p.y, 1)}`).join('L') + 'Z';
  const preview = {
    w: round(maxE - minE, 1),
    h: round(maxN - minN, 1),
    lots: lots.map((l) => ({ d: toSvg(lotsRaw.get(l.id).ring), s: l.status })),
  };

  const location = { ...meta.location };
  if (location.lat == null && lots.length) {
    location.lng = round((bounds[0] + bounds[2]) / 2, 6);
    location.lat = round((bounds[1] + bounds[3]) / 2, 6);
  }

  const gallery = await buildGallery({ slug, dir, meta, publicDir: path.join(ROOT, 'public') });

  const { cad, gallery: _galleryConfig, ...publicMeta } = meta;
  const detail = {
    slug,
    ...publicMeta,
    location,
    bounds,
    stats,
    affine,
    lots,
    manzanas: [...manzanas.entries()].map(([name, r]) => ({ name, area: round(area(r)), center: toLL(centroid(r)), coords: r.map(toLL) })),
    roads: roads.map((r) => r.map(toLL)),
    greens: greens.map((r) => r.map(toLL)),
    labels: labels.filter((l) => l.kind !== 'note' && l.kind !== 'beach'),
    pois,
    gallery: gallery.items,
  };
  const card = {
    slug,
    name: meta.name,
    tagline: meta.tagline,
    status: meta.status,
    location,
    logo: meta.logo || null,
    stats,
    preview,
    bounds,
    cover: gallery.cover,
    media: {
      photos: gallery.items.filter((i) => i.type === 'image').length,
      videos: gallery.items.filter((i) => i.type === 'video').length,
    },
  };
  return { detail, card };
}

// --------------------------------------------------------------------- main
const slugs = fs.readdirSync(SRC).filter((s) => fs.existsSync(path.join(SRC, s, 'project.json')));
fs.mkdirSync(path.join(OUT, 'projects'), { recursive: true });
const cards = [];
for (const slug of slugs) {
  const { detail, card } = await buildProject(slug);
  fs.writeFileSync(path.join(OUT, 'projects', `${slug}.json`), JSON.stringify(detail));
  cards.push(card);
  console.log(
    `✔ ${slug}: ${detail.stats.total} lotes, ${detail.manzanas.length} manzanas, ${detail.labels.length} rótulos, ${detail.pois.length} POIs, ${detail.gallery.length} en galería`,
  );
}
const order = { 'en-venta': 0, proximamente: 1, vendido: 2 };
cards.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
fs.writeFileSync(path.join(OUT, 'projects.json'), JSON.stringify(cards));
