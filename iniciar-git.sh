#!/usr/bin/env bash
# Sube la versión hosteada (ExpInv-host) a GitHub en un solo comando.
# Libremente re-ejecutable: si ya hay git, actualiza y hace push.
#
# USO:
#   ./iniciar-git.sh TU_USUARIO       (crea/usa el repo "inventarios-app")
#
# Ejemplo:
#   ./iniciar-git.sh miguel_cafe
#
# Luego en Render -> New -> Blueprint -> seleccionar "inventarios-app".

set -e
cd "$(dirname "$0")"

if [ -z "$1" ]; then
  echo "Falta el nombre de usuario de GitHub."
  echo "Uso: ./iniciar-git.sh TU_USUARIO"
  exit 1
fi

REPO="inventarios-app"
USER="$1"
REMOTE="https://github.com/$USER/$REPO.git"

# Asegurar que no se suban datos locales ni secretos
[ -f .gitignore ] || echo "node_modules/
server/data/
.env
*.log
*.keystore
app-out/
.DS_Store" > .gitignore

if [ ! -d .git ]; then
  git init
  git branch -M main
  echo "Repositorio inicializado."
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"

git add -A
git commit -m "InventariosApp: versión hosteada con PostgreSQL" || echo "Sin cambios nuevos que subir."

# El usuario debe estar logueado en GitHub; empujamos a 'main'
if ! git push -u origin main 2>/dev/null; then
  echo ""
  echo "El push falló. Comprueba que estés logueado y tengas el repositorio '$REPO'."
  echo "¿Falta crearlo? Crea un repositorio vacío de nombre '$REPO' en https://github.com/$USER"
  exit 1
fi

echo ""
echo "OK. Código subido a: $REMOTE"
echo "Siguiente paso: en https://dashboard.render.com -> New -> Blueprint -> elige '$REPO'."