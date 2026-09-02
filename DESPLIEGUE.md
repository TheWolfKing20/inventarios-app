# InventariosApp — guía de despliegue en internet (gratis)

Esta guía te lleva paso a paso a publicar la **versión hosteada** (`ExpInv-host`)
en un host gratuito con **persistencia de datos en PostgreSQL**, y después a
generar el **APK** (`ExpInv-apk`).

Recomendación: **Render** (web gratis) + **Neon** (PostgreSQL gratis) o la base
gratuita del propio Render. Todo sin tarjeta de crédito.

---

## 1. Subir el código a GitHub (necesario para Render)

1. Crea una cuenta en https://github.com y un **repositorio** (p. ej. `inventarios-app`).
2. Dentro de la carpeta `ExpInv-host` inicializa git y sube:
   ```bash
   cd ExpInv-host
   git init
   git add .
   git commit -m "Versión hosteada con PostgreSQL"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/inventarios-app.git
   git push -u origin main
   ```
   > El `.gitignore` ya excluye `node_modules`, `server/data`, `.env` y claves.
   > **No subas nunca** la carpeta `server/data` ni credenciales.

---

## 2. Crear la base de datos PostgreSQL gratuita (Neon)

Neon da bases de datos Postgres gratis y fáciles:

1. Crea cuenta en https://neon.tech (con GitHub por ejemplo).
2. Clic **"New project"** → nombre `inventarios` → región cerca de ti → **Create**.
3. Entra al proyecto → pestaña **Connect** → copia la **Connection string**, que
   se verá así (¡hay una copiarla completa, ya incluye usuario/contraseña!):
   ```
   postgresql://neondb_owner:TU_CONTRASEÑA@ep-algo-xyz.us-east-2.aws.neon.tech/inventarios?sslmode=require
   ```
4. **Guárdala en un lugar seguro.** La usarás en Render (paso 3). Es el valor
   de `DATABASE_URL`.

> Alternativa 100% en Render: en el paso 3, crea el servicio con el
> `render.yaml` incluido, que provisiona la base gratis automáticamente (no
> necesitarías Neon). Pero tener la base separada (Neon) da más control y se
> puede apagar cuando quieras. Con `render.yaml` también funciona; usa la que
> prefieras.

---

## 3. Publicar el backend en Render

### Opción A — "Blueprint" (usando `render.yaml`, configura todo a la vez)
1. Entra en https://dashboard.render.com → **New** → **Blueprint**.
2. Selecciona el repositorio `inventarios-app`.
3. Render lee `render.yaml`: crea el **Web Service** y la **base PostgreSQL**
   (plan free) automáticamente, y conecta la `DATABASE_URL`.
4. Clic **Apply**. Espera a que termine (unos minutos). Cuando el estado sea
   **Live**, tu app tiene una URL tipo `https://inventarios-app.onrender.com`.

### Opción B — manual (más control de variables)
1. En Render → **New** → **Web Service** → conecta el repositorio.
   - **Name**: `inventarios-app`
   - **Region**: una cercana.
   - **Runtime**: Node.
   - **Build command**: `npm install`
   - **Start command**: `node server/server.js`
   - **Plan**: **Free**
2. En **Environment** añade las variables:
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la cadena de Neon (o la de la base de Render) |
   | `JWT_SECRET` | una clave larga y aleatoria (32+ caracteres) |
   | `ADMIN_PASSWORD` | la contraseña que querrás para el usuario `admin` |
   | `CORS_ORIGIN` | `*` (la web y la APK la consumen) |
3. Clic **Create Web Service** → espera a **Live**.

Al arrancar, el server crea las tablas y el usuario `admin` automáticamente.

> **Aparece el error de puerto:** Render inyecta `$PORT`; el server la usa, no
> hay que configurar nada. Con `node server/server.js` funciona.

---

## 4. Verificar la publicación

Abre tu URL (p. ej. `https://inventarios-app.onrender.com`) y:
- Inicia sesión con `admin` / tu `ADMIN_PASSWORD`.
- Entra al **Dashboard** y usa **🧪 Datos de prueba** para comprobar que los
  ciclos (ganancia y pérdida) se guardan en la base.
- Reinicia el servicio en Render una vez: los datos **deben seguir ahí**
  (eso confirma que PostgreSQL funciona y no filesystem).

> La primera carga puede tardar ~1 min mientras Render despierta el servicio
> gratis. Es normal.

---

## 5. Ahora sí, generar el APK (Android)

Necesitas que la URL del paso anterior sea de **HTTPS** (Render la da por
defecto: `https://...`).

1. En `ExpInv-host/public` ya están: `manifest.webmanifest`, `sw.js`,
   `icon-192.png` e `icon-512.png` (verificado que responden 200). No hace
   falta añadir nada más al front.
2. Instala Bubblewrap en tu máquina:
   ```bash
   npm install -g @bubblewrap/cli
   ```
3. Edita `ExpInv-apk/twa-manifest.json` con tus datos reales:
   - `packageId`: algo único, p. ej. `com.micafe.inventarios`.
   - `host`: tu dominio sin protocolo, p. ej. `inventarios-app.onrender.com`.
   - `webManifestUrl`: `https://inventarios-app.onrender.com/manifest.webmanifest`.
4. En la carpeta `ExpInv-apk` ejecuta:
   ```bash
   bubblewrap init --manifest=twa-manifest.json
   bubblewrap build
   ```
5. El `.apk` se genera en `ExpInv-apk/app-out/twa-*.apk`. Instálalo en el
   teléfono. Abre en ventana completa, sin barra del navegador.

> Para instalar en un teléfono hay que permitir "instalar apps de orígenes
> desconocidos". Para publicarlo en Google Play se paga la cuenta de
> desarrollador (25 USD/año); sin eso, reparte el `.apk` directamente.

---

## Referencia rápida de archivos

| Archivo | Para qué es |
|---|---|
| `ExpInv-host/server/db.js` | Elige PostgreSQL (si `DATABASE_URL`) o JSON local. |
| `ExpInv-host/Procfile` | Comando de arranque para Render/Railway. |
| `ExpInv-host/render.yaml` | Blueprint: crea web service + base gratis. |
| `ExpInv-host/.env.example` | Plantilla de variables de entorno. |
| `ExpInv-host/public/manifest.webmanifest`, `sw.js`, `icon-*.png` | Convierten la web en PWA instalable (requisito de la APK). |
| `ExpInv-apk/twa-manifest.json` | Configuración de Bubblewrap para el APK. |