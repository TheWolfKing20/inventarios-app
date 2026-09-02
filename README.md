# InventariosApp — Versión HOSTEADA

Esta copia del proyecto está preparada para **publicarse en un host gratuito
(Render / Railway)** con **persistencia de datos en PostgreSQL**. Es una copia
independiente de la versión local (`../ExpInv`), por lo que puedes modificarla
sin tocar tu instalación local.

## Diferencia frente a la versión local

La única diferencia es la **capa de persistencia** (`server/db.js`):

- Si NO hay variable `DATABASE_URL` → usa **archivos JSON** en `server/data`
  (igual que la versión local). Útil para probarla sin base de datos.
- Si hay `DATABASE_URL` → usa **PostgreSQL** (tabla por colección, columna
  `jsonb`). Los datos sobreviven reinicios, obligatorio en hosts gratuitos.

## Probar en local

```bash
npm install
node server/server.js          # usa server/data (JSON)
# abre http://localhost:3000  →  admin / admin123
```

## Publicar en Render (recomendado, gratis)

1. Sube este proyecto a un repositorio de GitHub.
2. En Render crea dos recursos (o usa `render.yaml` con "New Blueprint"):
   - **Web Service** (Node) → comando de arranque: `node server/server.js`
   - **PostgreSQL** (plan free) → la app toma su `DATABASE_URL`
3. Variables de entorno: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`,
   `CORS_ORIGIN`. Ver `.env.example`.
4. Render crea las tablas automáticamente al arrancar (`db.init()`).
5. Usuario admin inicial: `admin` / el valor de `ADMIN_PASSWORD` (por defecto
   `admin123`). **Cámbiala en producción.**

## Railway (alternativa)

- Provisiona un servicio **PostgreSQL** y un **Web Service** Node.
- Conecta con `DATABASE_URL` apuntando a la base de Railway (o a Supabase/Neon).

## Notas

- El frontend estático se sirve desde el mismo servidor Node (`public/`), no
  necesitas un host separado para la web.
- El rol `consulta` y todos los demás usuarios se guardan en la base de datos.
- El seed de demo (`🧪 Datos de prueba`) funciona igual sobre PostgreSQL.
