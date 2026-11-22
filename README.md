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

## Galería de fotos y videos

1. Copia las fotos (`.jpg`, `.png`, `.webp`) y videos (`.mp4`, `.webm`) en `data/projects/<slug>/galeria/`.
2. El orden es alfabético; usa prefijos `01-`, `02-`… El texto que se muestra sale del nombre del archivo (`03-vista-al-mar.jpg` → "Vista al mar").
3. (Opcional) En `project.json` puedes fijar orden, textos y portada:
   ```json
   "gallery": [
     { "file": "05-sobrevuelo.mp4", "caption": "Sobrevuelo del proyecto" },
     { "file": "01-vista-aerea.jpg", "caption": "Vista aérea", "cover": true }
   ]
   ```
   La portada (`"cover": true`, o la primera foto) se usa en la tarjeta del inicio.
4. Un video puede tener portada propia: `recorrido.mp4` + `recorrido.poster.jpg`.
5. `npm run data` (o `npm run dev`).

Las fotos se optimizan solas al compilar (WebP de 1920 px + miniatura de 640 px + vista previa borrosa), así que puedes subirlas grandes.
**Videos:** máximo **25 MB** por archivo (límite de Cloudflare; si lo supera se omite y se avisa en la compilación). Recomendado: menos de 15 MB, 720p o 1080p, 15–30 segundos, sin audio. Para comprimir uno con [HandBrake](https://handbrake.fr) usa el preset *Web → Social 25 MB 30 Seconds 1080p* o *Fast 720p30*.

## Formulario "Publica tu proyecto"

Sin backend: por defecto abre WhatsApp con los datos ya escritos. Si prefieres recibirlos por correo/hoja de cálculo, crea un formulario en [Formspree](https://formspree.io) o [Web3Forms](https://web3forms.com) y pon su URL en un archivo `.env`:

```
VITE_LEADS_ENDPOINT=https://formspree.io/f/xxxxxxx
```

## Publicar en GitHub Pages (automático)

El workflow `.github/workflows/deploy.yml` compila y publica el sitio (se ejecuta manualmente; GitHub Pages requiere repositorio público o plan de pago).

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (solo la primera vez).
2. En la pestaña **Actions** ejecuta "Publicar en GitHub Pages" → **Run workflow**.
3. El sitio queda en `https://<usuario>.github.io/<repositorio>/`.

## Publicar en otro hosting

Es un sitio estático (`npm run build` → carpeta `dist/`). Funciona tal cual en **Vercel** o **Netlify** (incluye `wrangler.jsonc` para Cloudflare, `netlify.toml` para Netlify y `vercel.json` para Vercel).

- Build command: `npm run build`
- Output directory: `dist`

## Mapas

- **Satélite (vista híbrida):** imagen de Esri World Imagery con las etiquetas y vías de OpenStreetMap encima (veredas, playas, vías, negocios), en español cuando existe el nombre.
- **Mapa:** OpenFreeMap, estilo *Liberty* (datos de OpenStreetMap). Gratis, sin clave y con uso comercial permitido.
- Si OpenFreeMap no responde, el visor usa automáticamente un mapa de respaldo de Esri.
- Las etiquetas salen de OpenStreetMap: si un negocio o lugar de la zona no aparece, cualquiera puede agregarlo gratis en <https://www.openstreetmap.org> y se verá en el visor tras la siguiente actualización de OpenFreeMap (normalmente en pocos días).
