@echo off
setlocal DisableDelayedExpansion
start "" "%SystemRoot%\System32\wscript.exe" //B //NoLogo "%~dp0Iniciar.vbs"
