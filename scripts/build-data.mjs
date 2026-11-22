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
import ExcelJS from 'exceljs';
import { buildGallery } from './gallery.mjs';
import { normalizeLotKey, processCad } from '../shared/cad.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'projects');
const OUT = path.join(ROOT, 'public', 'data');

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

// --------------------------------------------------------------- proyecto
async function buildProject(slug) {
  const dir = path.join(SRC, slug);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  const prices = await readExcel(path.join(dir, 'lotes.xlsx'));
  const { zone = 18, hemisphere = 'north' } = meta.cad || {};
  const { plan, preview, warnings } = processCad(fs.readFileSync(path.join(dir, 'plano.dxf'), 'utf8'), {
    zone,
    hemisphere,
    prices,
    location: meta.location,
  });
  for (const w of warnings) console.warn(`  ⚠ ${slug}: ${w}`);

  const gallery = await buildGallery({ slug, dir, meta, publicDir: path.join(ROOT, 'public') });

  const { cad, gallery: _galleryConfig, ...publicMeta } = meta;
  const detail = { slug, ...publicMeta, ...plan, gallery: gallery.items };
  const card = {
    slug,
    name: meta.name,
    tagline: meta.tagline,
    status: meta.status,
    location: plan.location,
    logo: meta.logo || null,
    stats: plan.stats,
    preview,
    bounds: plan.bounds,
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
