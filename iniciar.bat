@echo off
cd /d "%~dp0"
if not exist "node_modules" (
  echo Instalando dependencias...
  npm install --production 2>nul
)
echo InventariosApp - http://localhost:3000
echo.
start "" "http://localhost:3000"
node server/server.js
