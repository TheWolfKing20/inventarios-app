#!/bin/bash
cd "$(dirname "$0")"

DIR="server/data"
if [ -d "$DIR" ]; then
  printf '[]' > "$DIR/products.json"
  printf '[]' > "$DIR/entries.json"
  printf '[]' > "$DIR/cycles.json"
  printf '[]' > "$DIR/suppliers.json"
  echo "Inventario en cero. Para restaurar los datos de prueba: node scripts/seed-demo.js"
else
  echo "No encontré la carpeta server/data. ¿Estás en la carpeta de la app?"
fi
