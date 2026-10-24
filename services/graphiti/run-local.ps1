$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.env')) { throw 'Run setup-local.ps1 first.' }
& ./.venv/Scripts/python.exe -m uvicorn app:create_app --factory --host 127.0.0.1 --port 8787 --workers 1 --env-file .env --no-access-log

