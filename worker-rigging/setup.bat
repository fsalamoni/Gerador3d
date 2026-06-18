@echo off
chcp 65001 >nul
title Gerador3D - Setup (uma vez)
cd /d "%~dp0"

echo.
echo ============================================================
echo   GERADOR3D - SETUP AUTOMATICO (rode uma vez)
echo ============================================================
echo.

REM ── 1. Python (tenta instalar via winget se faltar) ───────
where python >nul 2>&1
if errorlevel 1 (
  echo [..] Python nao encontrado. Tentando instalar via winget...
  where winget >nul 2>&1
  if errorlevel 1 (
    echo [ERRO] Python e winget ausentes.
    echo Instale o Python 3.11+ em https://www.python.org/downloads/
    echo e MARQUE "Add Python to PATH". Depois rode este setup de novo.
    pause & exit /b 1
  )
  winget install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements
  echo.
  echo [i] Python instalado. FECHE esta janela, abra de novo o setup.bat
  echo     (para o PATH atualizar). Depois ele segue do zero.
  pause & exit /b 0
)
echo [OK] Python encontrado.

REM ── 2. Localiza o Blender ──────────────────────────────────
set "BL=%BLENDER_PATH%"
if not defined BL set "BL=C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
if not exist "%BL%" (
  for /d %%D in ("C:\Program Files\Blender Foundation\Blender*") do set "BL=%%D\blender.exe"
)
if not exist "%BL%" (
  echo [ERRO] Blender nao encontrado. Instale o Blender 4.0+ ^(de preferencia 5.1^).
  echo Ou defina a variavel BLENDER_PATH com o caminho do blender.exe.
  pause & exit /b 1
)
echo [OK] Blender: "%BL%"

REM ── 3. Dependencias Python do Worker ───────────────────────
echo.
echo [..] Instalando dependencias Python...
python -m pip install --upgrade pip >nul 2>&1
python -m pip install -r requirements.txt
if errorlevel 1 ( echo [ERRO] Falha no pip install. & pause & exit /b 1 )
echo [OK] Dependencias instaladas.

REM ── 4. VRM Add-on no Blender (automatico) ──────────────────
echo.
echo [..] Instalando o VRM Add-on no Blender...
"%BL%" -b -P install_vrm_addon.py
if errorlevel 1 (
  echo [AVISO] Nao consegui instalar o VRM Add-on automaticamente.
  echo Voce pode instala-lo manualmente depois ^(ver GUIA_LOCAL.md, passo 3^).
) else (
  echo [OK] VRM Add-on pronto.
)

REM ── 5. Gera o template facial ARKit ────────────────────────
echo.
echo [..] Gerando o template facial ^(template_face.glb^)...
"%BL%" -b -P make_template.py -- --out template_face.glb
if exist "%~dp0template_face.glb" ( echo [OK] template_face.glb criado. ) else ( echo [AVISO] template_face.glb nao foi criado. )

REM ── 6. Baixa o cloudflared (tunel sem conta) ───────────────
echo.
if not exist "%~dp0cloudflared.exe" (
  echo [..] Baixando cloudflared ^(tunel publico, sem conta^)...
  curl -L -o "%~dp0cloudflared.exe" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  if exist "%~dp0cloudflared.exe" ( echo [OK] cloudflared baixado. ) else ( echo [AVISO] Falha ao baixar cloudflared ^(o ngrok pode ser usado como alternativa^). )
) else (
  echo [OK] cloudflared ja existe.
)

echo.
echo ============================================================
echo   SETUP CONCLUIDO!  Agora e so rodar:  start.bat
echo ============================================================
echo.
pause
