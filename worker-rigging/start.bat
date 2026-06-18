@echo off
chcp 65001 >nul
title Gerador3D - Worker de Rigging Local

cd /d "%~dp0"

echo.
echo ============================================================
echo    GERADOR3D - WORKER DE RIGGING LOCAL
echo ============================================================
echo.

echo [33mEncerrando processos antigos...[0m
taskkill /F /IM ngrok.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [33mIniciando Worker Python na porta 8000...[0m
start "Gerador3D Worker" cmd /k "python "%~dp0main.py""

echo [33mAguardando Worker iniciar...[0m
timeout /t 3 /nobreak >nul

echo [33mAbrindo tunel publico (cloudflared, sem conta)...[0m
start "Gerador3D Tunnel" cmd /k "python "%~dp0tunnel.py" 8000"

timeout /t 2 /nobreak >nul
echo.
echo ============================================================
echo   TUDO PRONTO!
echo   Worker: http://localhost:8000
echo   Tunel : a URL publica aparece (e e copiada) na janela do tunel
echo ============================================================
echo.
echo A URL ja foi copiada para a area de transferencia.
echo Cole em: Configuracoes -^> Self-hosted -^> Base URL
echo.
echo Feche as janelas quando quiser parar.
echo.
pause
