@echo off
chcp 65001 >nul
title Gerador3D - Iniciar TUDO (rigging + geracao + gateway + tunel)
cd /d "%~dp0"

echo.
echo ============================================================
echo   GERADOR3D - INICIANDO TUDO (1 URL para tudo)
echo ============================================================
echo.

echo [33mEncerrando tuneis antigos...[0m
taskkill /F /IM cloudflared.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [33m1/4 Worker de RIGGING (porta 8000)...[0m
start "Gerador3D Rigging (8000)" cmd /k "python "%~dp0..\worker-rigging\main.py""

echo [33m2/4 Worker de GERACAO 3D (porta 8001)... (precisa das deps de IA)[0m
start "Gerador3D Geracao (8001)" cmd /k "python "%~dp0..\worker-3dgen\main.py""

echo [33m3/4 Gateway (porta 8080)...[0m
timeout /t 3 /nobreak >nul
start "Gerador3D Gateway (8080)" cmd /k "python "%~dp0gateway.py""

echo [33m4/4 Tunel publico para o gateway (8080)...[0m
timeout /t 2 /nobreak >nul
start "Gerador3D Tunnel" cmd /k "python "%~dp0..\worker-rigging\tunnel.py" 8080"

echo.
echo ============================================================
echo   PRONTO! A URL publica (uma so) aparece e e copiada na
echo   janela do tunel. Cole em Configuracoes -^> Self-hosted -^> Base URL.
echo   Vale para RIGGING e para GERACAO 3D ao mesmo tempo.
echo ============================================================
echo.
echo Diagnostico:  python "%~dp0..\worker-rigging\doctor.py"
echo.
pause
