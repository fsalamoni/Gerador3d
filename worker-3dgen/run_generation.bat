@echo off
chcp 65001 >nul
title Gerador3D - Worker de Geracao 3D (porta 8001)
cd /d "%~dp0"

if not exist venv\Scripts\activate (
  echo [ERRO] Ambiente nao preparado. Rode primeiro:  setup_generation.bat
  pause & exit /b 1
)

call venv\Scripts\activate
set GEN_BACKEND=triposr
set PYTHONPATH=%~dp0TripoSR;%PYTHONPATH%

echo ============================================================
echo   Worker de Geracao 3D rodando em http://localhost:8001
echo   Backend: TripoSR (imagem->3D) | texto->3D usa texto->imagem
echo ============================================================
echo Na 1a geracao os pesos do modelo sao baixados (uma vez).
echo Feche esta janela para parar.
echo.
python main.py
pause
