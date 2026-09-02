#!/usr/bin/env bash
# Lanza la versión HOSTEADA en local (usa server/data en JSON si no hay DATABASE_URL)
# Igual que la versión local pero con la capa db.js (preparada para PostgreSQL).
cd "$(dirname "$0")"

# Si instalas deps nuevas, descomenta:
# [ -d node_modules ] || npm install

PORT="${PORT:-3000}"
echo "Arrancando InventariosApp (hosted) en http://localhost:$PORT"
echo "Sin DATABASE_URL → datos en server/data (JSON)."
node server/server.js