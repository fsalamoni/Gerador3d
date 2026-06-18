@echo off
chcp 65001 >nul
title Gerador3D Desktop - Preparar motor (Python)
cd /d "%~dp0"

REM Fallback manual: o app normalmente prepara isto sozinho na 1a execucao.
where python >nul 2>&1
if errorlevel 1 ( echo [ERRO] Instale o Python 3.11+ (marque "Add to PATH"). & pause & exit /b 1 )

echo Criando ambiente virtual e instalando dependencias do motor...
python -m venv pyengine
call pyengine\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo.
echo Pronto. Para geracao 3D na GPU, veja worker-3dgen\README.md.
echo Para rigging, instale o Blender + VRM Add-on (worker-rigging\GUIA_LOCAL.md).
pause
