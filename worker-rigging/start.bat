@echo off
chcp 65001 >nul
title Gerador3D - Worker de Rigging Local
echo.
echo [36m╔══════════════════════════════════════════════╗
echo ║   GERADOR3D - WORKER DE RIGGING LOCAL      ║
echo ║   Iniciando servidor + ngrok automaticamente ║
echo ╚══════════════════════════════════════════════╝[0m
echo.

cd /d d:\Gerador3d\worker-rigging

echo [33m[1/2] Iniciando Worker Python na porta 8000...[0m
start "Gerador3D Worker" cmd /k "python main.py"

echo [33m[2/2] Iniciando ngrok na porta 8000...[0m
echo.
echo [32m====================================[0m
echo [32m  TUDO PRONTO!                       [0m
echo [32m  Worker: http://localhost:8000      [0m
echo [32m  Ngrok:  veja a URL no terminal     [0m
echo [32m====================================[0m
echo.
echo [93mCopie a URL do ngrok (Forwarding) e cole nas[0m
echo [93mConfigurações da plataforma em Self-hosted.[0m
echo.
echo [90mFeche esta janela quando quiser parar tudo.[0m
echo.
start "Gerador3D Ngrok" cmd /k "ngrok http 8000"
