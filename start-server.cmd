@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$source = Get-Content -Raw -Encoding UTF8 '.\server.ps1'; & ([ScriptBlock]::Create($source))"
