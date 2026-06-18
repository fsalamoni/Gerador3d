@echo off
chcp 65001 >nul
title Gerador3D - Worker de Rigging Local

cd /d "%~dp0"

echo.
echo [36m╔══════════════════════════════════════════════╗
echo ║   GERADOR3D - WORKER DE RIGGING LOCAL      ║
echo ╚══════════════════════════════════════════════╝[0m
echo.

echo [33mMatando processos antigos...[0m
taskkill /F /IM python.exe /FI "WINDOWTITLE eq Gerador3D Worker" >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [33mIniciando Worker Python na porta 8000...[0m
start "Gerador3D Worker" cmd /k "python "%~dp0main.py""

echo [33mAguardando Worker iniciar...[0m
timeout /t 3 /nobreak >nul

echo [33mIniciando ngrok...[0m
start "Gerador3D Ngrok" cmd /k "ngrok http 8000"

timeout /t 2 /nobreak >nul
echo.
echo [32m====================================[0m
echo [32m  TUDO PRONTO!                       [0m
echo [32m  Worker: http://localhost:8000      [0m
echo [32m  Ngrok:  veja a URL no outro terminal[0m
echo [32m====================================[0m
echo.
echo [93mCopie a URL 'Forwarding' da janela do ngrok[0m
echo [93me cole em: Configuracoes -> Self-hosted -> Base URL[0m
echo.
echo [90mFeche as janelas quando quiser parar.[0m
echo.
pause

