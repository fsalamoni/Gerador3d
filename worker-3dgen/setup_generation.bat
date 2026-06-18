@echo off
chcp 65001 >nul
title Gerador3D - Setup da Geracao 3D (IA local na sua GPU)
cd /d "%~dp0"

echo ============================================================
echo   GERADOR3D - SETUP DA GERACAO 3D (TripoSR, imagem/texto -> 3D)
echo   Roda na SUA GPU NVIDIA, 100%% local. Faca uma vez.
echo ============================================================
echo.

REM ── Pre-requisitos ─────────────────────────────────────────
where python >nul 2>&1
if errorlevel 1 ( echo [ERRO] Python 3.11+ nao encontrado. Instale de python.org (marque "Add to PATH"). & pause & exit /b 1 )
where git >nul 2>&1
if errorlevel 1 ( echo [ERRO] Git nao encontrado. Instale de https://git-scm.com/download/win & pause & exit /b 1 )
echo [OK] Python e Git encontrados.

REM ── Ambiente virtual ───────────────────────────────────────
if not exist venv (
  echo [..] Criando ambiente virtual (venv)...
  python -m venv venv
)
call venv\Scripts\activate
python -m pip install --upgrade pip wheel setuptools >nul

REM ── PyTorch com CUDA ───────────────────────────────────────
REM Padrao: CUDA 12.1 (cu121), compativel com a maioria das GPUs/drivers atuais.
REM   - GPUs muito novas (RTX 50xx) podem precisar de cu124/cu128.
REM   - Sem GPU? troque "cu121" por "cpu" (fica MUITO lento, mas funciona).
echo.
echo [..] Instalando PyTorch (CUDA 12.1)... (download grande, ~2.5 GB)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
if errorlevel 1 ( echo [ERRO] Falha ao instalar o PyTorch. & pause & exit /b 1 )

REM ── Dependencias do worker + geracao ──────────────────────
echo.
echo [..] Instalando dependencias do worker...
pip install -r requirements.txt
echo [..] Instalando libs de geracao (diffusers para texto->3D)...
pip install diffusers transformers accelerate

REM ── TripoSR (imagem -> 3D) ─────────────────────────────────
echo.
if not exist TripoSR (
  echo [..] Baixando o TripoSR (modelo open-source, MIT)...
  git clone https://github.com/VAST-AI-Research/TripoSR.git
)
echo [..] Instalando dependencias do TripoSR...
pip install -r TripoSR\requirements.txt
if errorlevel 1 (
  echo [AVISO] Alguma dependencia do TripoSR falhou. Geralmente e o "torchmcubes",
  echo que precisa do "Microsoft C++ Build Tools" (Desktop development with C++).
  echo Instale em https://visualstudio.microsoft.com/visual-cpp-build-tools/ e rode de novo.
)

REM ── Verificacao ────────────────────────────────────────────
echo.
echo [..] Verificando a GPU/CUDA...
python -c "import torch; ok=torch.cuda.is_available(); print('CUDA disponivel:', ok); print('GPU:', torch.cuda.get_device_name(0) if ok else 'NENHUMA (vai usar CPU, lento)')"

echo.
echo ============================================================
echo   SETUP CONCLUIDO! Para iniciar a geracao:  run_generation.bat
echo ============================================================
pause
