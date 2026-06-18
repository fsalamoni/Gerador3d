@echo off
chcp 65001 >nul
title Gerador3D Desktop - DEV
cd /d "%~dp0"

echo Build do frontend (modo LOCAL)...
pushd ..\frontend
call npm install
set VITE_LOCAL=true
call npm run build:local
popd

echo Dependencias do Electron...
call npm install

echo Abrindo o app...
call npm start
