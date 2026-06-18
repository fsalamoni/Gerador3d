@echo off
chcp 65001 >nul
title Gerador3D Desktop - Gerar instalador
cd /d "%~dp0"

echo ============================================================
echo   GERADOR3D DESKTOP - build do instalador (.exe)
echo ============================================================

echo.
echo [1/3] Build do frontend (modo LOCAL)...
pushd ..\frontend
call npm install
set VITE_LOCAL=true
call npm run build:local
popd
if not exist "..\frontend\dist-local\index.html" (
  echo [ERRO] build local do frontend falhou. & pause & exit /b 1
)

echo.
echo [2/3] Dependencias do Electron...
call npm install

echo.
echo [3/3] Gerando instalador (electron-builder)...
call npm run dist

echo.
echo PRONTO! O instalador esta em:  desktop\release\
pause
