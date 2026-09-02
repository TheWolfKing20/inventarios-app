@echo off
cd /d "%~dp0"
set DIR=server\data
if exist "%DIR%" (
  echo []> "%DIR%products.json"
  echo []> "%DIR%entries.json"
  echo []> "%DIR%cycles.json"
  echo []> "%DIR%suppliers.json"
  echo Inventario en cero. Para restaurar datos de prueba: node scripts/seed-demo.js
) else (
  echo No encontre server\data. Estaras en la carpeta de la app?
)
pause
