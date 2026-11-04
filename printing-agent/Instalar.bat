@echo off
setlocal DisableDelayedExpansion
title LotoEnlace - Instalar agente de impresion
echo Instalando el agente completo de LotoEnlace...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" -AppUrl "http://lotoenlace.test"
if errorlevel 1 (
  echo No se completo la instalacion. Revisa el mensaje anterior.
  pause
  exit /b 1
)
exit /b 0
