# VisorLotes 2.0

Plataforma multi‑proyecto para vender lotes sobre mapa satelital: cada proyecto con su plano CAD real, estado de cada lote, medidas, colindancias y un **diseñador de casas** que dibuja a escala real qué vivienda cabe en el lote, respetando los retiros.

Tecnologías: **React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + MapLibre GL 5 (WebGL) + Motion**.

---

## Verlo en tu computador (Visual Studio Code)

Requisitos: [Node.js 20 o superior](https://nodejs.org) y Git.

```bash
git clone https://github.com/RafaelYances/VisorLotes2026-7.git
cd VisorLotes2026-7
git checkout claude/hopeful-goldberg-ub70dn
npm install
npm run dev
```

Abre <http://localhost:5173>. Cada vez que guardes un archivo, el navegador se actualiza solo.

| Comando           | Qué hace                                                            |
| ----------------- | ------------------------------------------------------------------- |
| `npm run dev`     | Genera los datos y abre el servidor de desarrollo                   |
| `npm run data`    | Solo regenera los datos desde los DXF/Excel (`public/data/`)         |
| `npm run build`   | Compila la versión de producción en `dist/`                         |
| `npm run preview` | Sirve la versión compilada para probarla                            |
| `npm run format`  | Formatea el código                                                  |

---

## Cómo está organizado

```
data/projects/<slug>/        ← FUENTE de cada proyecto (lo que tú editas)
  project.json               ← nombre, descripción, contacto, retiros, ubicación…
  plano.dxf                  ← plano CAD en coordenadas UTM
  lotes.xlsx                 ← (opcional) Cod. Lote | Área | Manzano | Precio | Estado
scripts/build-data.mjs       ← convierte DXF + Excel → JSON liviano (public/data/)
src/
  pages/Home.tsx             ← inicio: hero, proyectos, cómo funciona, "publica tu proyecto"
  pages/ProjectPage.tsx      ← visor del proyecto (mapa + panel / bottom sheet en móvil)
  viewer/MapView.tsx         ← mapa MapLibre: lotes, vías, rótulos, salidas al mar, casa
  viewer/LotDetail.tsx       ← ficha del lote
  viewer/LotPlan.tsx         ← plano SVG a escala (medidas, colindancias, norte, retiros)
  viewer/HouseDesigner.tsx   ← catálogo de casas y verificación "cabe / no cabe"
  lib/houses.ts              ← catálogo de diseños de casa (medidas en metros)
  config.ts                  ← marca de la plataforma, WhatsApp, endpoint del formulario
```

El navegador **ya no lee el DXF**: el script lo convierte una sola vez en JSON (78 KB para 108 lotes), con área, perímetro, frente, fondo, lados, colindancias y orientación ya calculados desde las coordenadas UTM originales.

## Actualizar el estado o precio de los lotes

1. Edita `data/projects/<slug>/lotes.xlsx` (columna **Estado**: `Disponible`, `Reservado` o `Vendido`; columna **Precio**: número o `Consultar`).
2. Ejecuta `npm run data` (o reinicia `npm run dev`).

## Agregar un proyecto nuevo

1. Crea la carpeta `data/projects/mi-proyecto/`.
2. Copia ahí el plano como `plano.dxf`. Convenciones de capas:
   - `Lote <manzana> <número>` → cada lote (polilínea cerrada), ej. `Lote 3 12`
   - `Mz.<manzana>` → manzanas
   - `AREA VIAL` → vías · `AREA VERDE` → zonas verdes
   - Textos sueltos (ej. "VIA PRINCIPAL", "ETAPA 1", "SALIDA AL MAR 2") se muestran como rótulos. Un texto "SALIDA AL MAR" con otro cercano "A solo X minutos" se convierte en punto de interés.
3. Crea `project.json` (usa el de `riviera-del-viento` como plantilla). En `cad` indica la zona UTM y el hemisferio.
4. (Opcional) agrega `lotes.xlsx`.
5. `npm run data` → el proyecto aparece en el inicio en `/proyecto/mi-proyecto`.

> `mirador-troncal` se armó con el archivo `VISOR.dxf` que había en el repositorio. Su nombre y textos son de ejemplo: cámbialos en su `project.json` o borra la carpeta.

## Formulario "Publica tu proyecto"

Sin backend: por defecto abre WhatsApp con los datos ya escritos. Si prefieres recibirlos por correo/hoja de cálculo, crea un formulario en [Formspree](https://formspree.io) o [Web3Forms](https://web3forms.com) y pon su URL en un archivo `.env`:

```
VITE_LEADS_ENDPOINT=https://formspree.io/f/xxxxxxx
```

## Publicar en internet

Es un sitio estático (`npm run build` → carpeta `dist/`). Funciona tal cual en **Vercel** o **Netlify** (ya incluye `vercel.json` y `public/_redirects` para las rutas `/proyecto/...`).

- Build command: `npm run build`
- Output directory: `dist`

## Mapas

- Satélite: Esri World Imagery (gratuito, con atribución). En esa zona hay imagen hasta zoom 18; por encima se amplía.
- Mapa: CARTO Voyager. Tipografías de rótulos: OpenFreeMap.
