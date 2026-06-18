@echo off
chcp 65001 >nul
title Gerador3D - Worker de Geracao 3D (open-source)

cd /d "%~dp0"

echo.
echo === GERADOR3D - WORKER DE GERACAO 3D (porta 8001) ===
echo Backend: %GEN_BACKEND%  (vazio = triposr, padrao)
echo.

echo [33mIniciando worker de geracao 3D...[0m
start "Gerador3D 3DGen" cmd /k "python "%~dp0main.py""

timeout /t 3 /nobreak >nul

echo [33mIniciando tunel (cloudflared/ngrok) na porta 8001...[0m
start "Gerador3D Tunnel 3DGen" cmd /k "python "%~dp0..\worker-rigging\tunnel.py" 8001"

echo.
echo Copie a URL publica da janela do tunel e cole em:
echo   Configuracoes -^> Self-hosted -^> Base URL
echo.
pause
