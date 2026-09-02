#!/bin/bash
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias..."
  npm install --production 2>/dev/null
fi

echo "InventariosApp - http://localhost:3000"
echo ""

# Abrir navegador automáticamente
if command -v xdg-open &>/dev/null; then
  (sleep 2 && xdg-open http://localhost:3000) &
elif command -v sensible-browser &>/dev/null; then
  (sleep 2 && sensible-browser http://localhost:3000) &
fi

node server/server.js
