# Seguridad de Lotes del Caribe

Última revisión completa: noviembre de 2026.

## 1. Qué protege la plataforma

### Acceso al panel (`/admin`)
- **Una sola cuenta** de administración. El registro solo se puede hacer **una vez** y exige el secreto `ADMIN_SETUP_TOKEN` (guardado como *Secret* en Cloudflare).
- **Doble factor obligatorio**: contraseña (mín. 12 caracteres, letras y números) **+** código de 6 dígitos de una app autenticadora (TOTP, RFC 6238).
- Contraseña guardada con **PBKDF2‑SHA256** (100 000 iteraciones, sal aleatoria). Nunca se guarda en texto plano.
- Los códigos de 6 dígitos **no se pueden reutilizar** (protección contra repetición).
- **Bloqueo** tras 5 intentos fallidos por conexión (15 min) y 30 en total por hora. Las conexiones desde donde ya ingresaste con éxito no quedan afectadas por el límite global (evita que un atacante te deje por fuera).
- Sesiones de **12 horas** en cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`. En la base de datos solo se guarda el **hash** del token.
- **Cambiar contraseña** (pestaña *Actividad*): exige la contraseña actual + código, y cierra todas las demás sesiones.
- **Cerrar todas las sesiones** con un botón (pestaña *Actividad*).

### Acciones sensibles: doble autorización
- **Publicar/ocultar** y **eliminar** un proyecto vuelven a pedir contraseña + código nuevo, aunque ya hayas iniciado sesión.
- **Eliminar** exige además escribir el nombre exacto del proyecto.

### Protección de la API
- Todas las rutas del panel exigen sesión válida (comprobada en el servidor, nunca en el navegador).
- **CSRF**: toda escritura exige venir del mismo origen (`Origin`) y la cookie es `SameSite=Strict`.
- **Validación estricta** de todo lo que entra: estados, precios, identificadores, textos (longitud y sin `<` `>` en datos del plano), enlaces solo `https://`, logos solo de la propia plataforma, tamaños máximos.
- Cuerpos de solicitud limitados (200 KB general, 12 MB para planos, 80 MB para videos).
- Errores genéricos hacia afuera ("Error interno"); el detalle queda en los registros de Cloudflare.

### Archivos subidos (galería y logos)
- El tipo se verifica por el **contenido real** del archivo (WebP, JPEG, PNG, MP4, WebM). Se rechaza cualquier otra cosa (p. ej. SVG o HTML disfrazados).
- Se sirven con `nosniff`, `Content-Disposition: inline` y una política que **impide ejecutar código** aunque se abran directamente.
- Rutas de archivo estrictas (sin `..` ni caracteres especiales). Nombres con identificadores aleatorios (UUID).
- Al eliminar un proyecto se borran **todos** sus archivos.

### Navegador (cabeceras de seguridad)
- **Content‑Security‑Policy**: solo se ejecuta código propio; imágenes y datos solo de la plataforma y de los proveedores de mapas (Esri, Google, OpenFreeMap).
- `frame-ancestors 'none'` + `X-Frame-Options: DENY` (nadie puede incrustar el sitio para engañar clics).
- `Strict-Transport-Security` (siempre HTTPS), `nosniff`, `Referrer-Policy`, `Permissions-Policy` (solo ubicación, para "Mi ubicación").
- `/admin` y `/api/` excluidos de buscadores (`robots.txt` y `X-Robots-Tag`).
- El texto que viene de planos y del panel se muestra siempre como **texto**, nunca como HTML.

### Portal de dueños (`/dueno`)
- Cuentas separadas del administrador (otra tabla, otra cookie `__Host-vl_owner`): una sesión de dueño nunca da acceso al panel.
- Alta solo por invitación del administrador: enlace aleatorio de un solo uso, vence en 7 días; en la base de datos se guarda solo su hash. El token va en el `#` del enlace (no viaja a ningún servidor en las cabeceras) y se borra de la barra de direcciones al abrirlo.
- Contraseña (mín. 10) + código TOTP obligatorio; bloqueo por intentos fallidos; mismo mensaje y tiempo para correos existentes o no.
- Permiso mínimo: solo cambia el **estado** de los lotes de **sus** proyectos (el servidor lo verifica en cada solicitud). El precio se conserva.
- Quitar acceso cierra sus sesiones de inmediato; eliminar un proyecto elimina sus accesos e invitaciones.

### Formulario "Publica tu proyecto"
- Solo acepta envíos desde el propio sitio, con campo trampa para bots, tiempo mínimo de llenado y límites (5 por hora por conexión, 300 por día).
- Datos validados y con longitud máxima; se muestran en el panel siempre como texto.
- Solo el administrador los ve (requiere sesión). Las archivadas se borran solas a los 2 años.

### Privacidad de proyectos ocultos
- Un proyecto oculto o eliminado no aparece en la lista, su ficha y galería responden 404, y tampoco se exponen sus estados ni portada en el resumen público.

### Dependencias y secretos
- `npm audit` del código publicado: **0 vulnerabilidades** (MapLibre actualizado a 6.17.0 por GHSA‑jrc7‑96c5‑q579).
- Las alertas restantes (`uuid` vía `exceljs`) son de herramientas de compilación que no llegan al sitio.
- Versiones fijas (sin `^`) en `package.json`.
- Sin claves en el repositorio ni en su historial. La clave de Google se inyecta al compilar (`VITE_GOOGLE_MAPS_KEY`) y está restringida por dominio y por API, con cuota diaria.

### Registro de actividad
Ingresos, intentos fallidos, dobles autorizaciones fallidas, cambios de lotes, galería, proyectos y contraseña quedan registrados con fecha e IP (pestaña *Actividad*).

## 2. Tu lista de tareas (lo que no se puede hacer desde el código)

1. **Activa la verificación en dos pasos** en las cuentas que controlan todo:
   - **Cloudflare** (My Profile → Authentication → Two-Factor). *Es la más importante*: quien entre a tu Cloudflare puede modificar la base de datos y el sitio.
   - **GitHub** (Settings → Password and authentication).
   - **Google** (la cuenta de Google Cloud con la facturación).
2. **Borra `ADMIN_SETUP_TOKEN`** de Cloudflare (*Settings → Variables and secrets*). Ya no se necesita: el registro está cerrado.
3. **Guarda la clave manual** de tu app autenticadora en papel o en un gestor de contraseñas.
4. **Usa una contraseña única** para el panel (no la uses en ningún otro sitio).
5. **Revisa *Actividad*** de vez en cuando. Si ves ingresos que no reconoces: *Cerrar todas las sesiones* + *Cambiar contraseña*.
6. **Recomendado: dominio propio** (p. ej. `lotesdelcaribe.com`) conectado en Cloudflare. Permite activar reglas de **límite de peticiones (WAF)** contra abusos, que no están disponibles en `workers.dev`.

## 3. Si pierdes el celular (recuperación)

Tus datos (proyectos, lotes, galería) **no se pierden**. Solo hay que volver a crear el acceso:

1. Si tienes la **clave manual** guardada: instálala en una app autenticadora nueva y listo.
2. Si no la tienes:
   1. Cloudflare → **Storage & Databases → D1 → visorlotes → Console**, y ejecuta:
      ```sql
      DELETE FROM sessions;
      DELETE FROM admin;
      ```
   2. Crea de nuevo el secreto `ADMIN_SETUP_TOKEN` (una frase nueva).
   3. Entra a `/admin` y configura tu acceso otra vez (contraseña + QR).
   4. Borra de nuevo `ADMIN_SETUP_TOKEN`.

## 4. Copias de seguridad
- **Base de datos (D1)**: Cloudflare guarda un historial (*Time Travel*) que permite restaurarla a un momento anterior (Storage & Databases → D1 → visorlotes → *Time Travel*). Para una copia manual: `npx wrangler d1 export visorlotes --remote --output backup.sql`.
- **Fotos y videos (R2)**: guarda tus originales en tu computador o en Google Drive.
- **Código**: está en GitHub.

## 5. Riesgos residuales conocidos (aceptados)
- **Límites del plan gratuito**: un ataque de tráfico masivo podría agotar las 100 000 visitas diarias gratis de Cloudflare Workers (el sitio dejaría de responder ese día, **sin cobros**). Mitigación: dominio propio + reglas WAF.
- **Clave de Google**: la restricción por dominio la respetan los navegadores, pero alguien podría usarla desde un servidor imitando tu dominio. Con la cuota diaria de 3 200 no hay costo: como mucho, ese día el visor usaría el mapa gratis.
- El secreto TOTP se guarda en D1 sin cifrado adicional; solo es accesible para quien controle tu cuenta de Cloudflare (por eso el punto 1 de la lista).
- Las fotos de la galería son públicas por diseño (sus direcciones son aleatorias e impredecibles).
