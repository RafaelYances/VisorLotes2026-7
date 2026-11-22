# Lotes del Caribe

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

## Seguridad

Ver **[SECURITY.md](SECURITY.md)**: medidas implementadas, lista de tareas del administrador, recuperación de acceso y copias de seguridad.

## Panel de administración (`/admin`)

Gestiona el sitio sin tocar código, con efecto inmediato en el visor:
- **Lotes:** estados y precios (individual o en grupo).
- **Galería:** subir fotos y videos (arrastrando o desde el celular), ordenarlos, escribir sus textos, elegir la portada y eliminarlos. Las fotos se optimizan en el navegador antes de subir (WebP 1920 px + miniatura + vista previa borrosa). Videos MP4/WebM de hasta 60 MB (recomendado < 15 MB). Se guardan en **Cloudflare R2** (`visorlotes-media`, 10 GB gratis) y se sirven desde `/files/…`.
- La primera vez que abres la galería de un proyecto en el panel, se importan las fotos de `data/projects/<slug>/galeria/`. Desde ese momento la galería del sitio es la del panel.
- **Proyectos:** botón **Nuevo proyecto** (datos → plano DXF procesado en el navegador con vista previa sobre el satélite → crear). Los proyectos nuevos se crean **ocultos**. En la pestaña **Proyecto** se editan nombre, textos, ubicación, contacto, moneda, logo, destacados y retiros, y se puede **reemplazar el plano** (los estados editados se conservan para los lotes con el mismo nombre).
- **Doble autorización** para **publicar/ocultar** y **eliminar** un proyecto: vuelve a pedir contraseña y un código nuevo de 6 dígitos; para eliminar, además, escribir el nombre del proyecto. Eliminar borra datos, galería, logo y plano. Los proyectos del repositorio (`data/projects/`) se retiran del sitio, pero sus archivos quedan en GitHub.
- El procesamiento del DXF está en `shared/cad.js` y lo usan tanto `npm run data` como el panel, así que el resultado es idéntico.

**Seguridad del ingreso**
- Una sola cuenta de administración, protegida con **contraseña + código de 6 dígitos** de una app autenticadora (Google Authenticator, Microsoft Authenticator…).
- Contraseña guardada con PBKDF2 (nunca en texto plano); sesiones de 12 h en cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
- Bloqueo tras 5 intentos fallidos por IP (15 min) y 30 en total por hora; los códigos no se pueden reutilizar.
- Registro de actividad (ingresos, intentos fallidos y cambios) en la pestaña *Actividad*, con botón para cerrar todas las sesiones.

**Primera configuración (una sola vez)**
1. En Cloudflare → tu Worker → *Settings → Variables and secrets* (las de **runtime**) → *Add* → tipo **Secret**:
   `ADMIN_SETUP_TOKEN` = una frase larga que solo tú conozcas (mínimo 16 caracteres).
2. Abre `https://tu-sitio/admin`, escribe esa frase, crea tu contraseña y escanea el código QR con tu app autenticadora.
3. Listo: el registro queda cerrado para siempre. Puedes borrar `ADMIN_SETUP_TOKEN` si quieres.

**Base de datos y archivos:** Cloudflare D1 `visorlotes` y R2 `visorlotes-media` (se crean solos al publicar; R2 debe estar activado en la cuenta: *Storage & Databases → R2 → Enable*, plan Free).

**En tu computador:** crea `.dev.vars` con `ADMIN_SETUP_TOKEN=...`, ejecuta `npm run build` y luego `npm run dev:api` (servidor local en <http://localhost:8787>). Para trabajar con recarga automática usa además `npm run dev` (el visor en :5173 envía `/api` al servidor local).

## Actualizar el estado o precio de los lotes

Desde el panel `/admin` (recomendado). Los valores del Excel (`data/projects/<slug>/lotes.xlsx`) son los iniciales; lo que cambies en el panel tiene prioridad.

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

## Portal de dueños (`/dueno`)

Para que el dueño de cada proyecto actualice **solo el estado de sus lotes** (disponible, reservado, vendido):
1. Panel → pestaña **Proyecto** → **Acceso del dueño** → **Crear acceso para el dueño** (nombre + usuario). La contraseña se genera sola (ej. `k7Pm-4xQa-9tRw`).
2. **Enviar por WhatsApp** o **Copiar datos**: enlace, usuario y contraseña.
3. El dueño entra por `/dueno` con usuario y contraseña. Solo ve sus proyectos y solo cambia estados (con "Deshacer"). No puede cambiar precios, fotos, textos ni el plano, ni su contraseña.
4. Si olvida sus datos: **Ver** muestra la contraseña actual. **Generar contraseña nueva** invalida la anterior y cierra su sesión. **Quitar acceso** lo saca de inmediato.
5. Un mismo usuario puede tener varios proyectos ("Dar acceso a un usuario existente").

## Formulario "Publica tu proyecto"

Cada solicitud se **guarda en el servidor** (D1, tabla `leads`) y aparece en el panel → botón **Solicitudes** (con contador de nuevas). Desde ahí: escribirle por WhatsApp con un saludo listo, copiar sus datos, agregar notas internas y marcarla como *contactada* o *archivada*. Quien llena el formulario ve "¡Solicitud recibida!" solo si quedó guardada, y tiene la opción adicional de escribir por WhatsApp.

Antispam: campo trampa invisible, tiempo mínimo de llenado, máx. 5 solicitudes por hora por conexión y 300 por día en total.

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

### Google Maps (recomendado: lugares turísticos, muelle, negocios)
El visor usa los mapas de Google por su servicio oficial (**Map Tiles API**) cuando existe la variable `VITE_GOOGLE_MAPS_KEY`:
- **Satélite:** imagen de Google con calles, lugares y negocios encima (vista híbrida).
- **Mapa:** mapa de calles de Google.
- Se muestran el logo y los derechos de autor de Google, como exigen sus condiciones.
- Si la clave falla, el dominio no está autorizado o se agota la cuota diaria, el visor cambia solo al mapa gratis.

Configuración de la clave (nunca se guarda en el repositorio):
- **Cloudflare:** *Settings → Build → Variables and secrets* → `VITE_GOOGLE_MAPS_KEY` = tu clave. Luego vuelve a publicar (un push o *Retry build* del último commit).
- **Tu computador:** copia `.env.example` como `.env.local`, pega la clave y reinicia `npm run dev`.
- **Google Cloud:** la clave debe estar restringida a tus dominios (`https://tu-sitio.workers.dev/*`, `http://localhost:5173/*`) y a la API *Map Tiles API*. Pon un límite diario de unas 3.300 solicitudes para no pasar de las 100.000 gratis al mes.

### Mapa gratis (respaldo)
- **Satélite:** Esri World Imagery con etiquetas y vías de OpenStreetMap encima.
- **Mapa:** OpenFreeMap, estilo *Liberty* (OpenStreetMap). Gratis, sin clave y con uso comercial permitido.
- Si OpenFreeMap no responde, se usa un respaldo raster de Esri.
