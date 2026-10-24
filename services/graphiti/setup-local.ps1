$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Create once. Values are never printed or stored in tracked files.
if (-not (Test-Path -LiteralPath '.env')) {
    function New-LocalSecret {
        $secretBytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
        return [Convert]::ToHexString($secretBytes).ToLowerInvariant()
    }
    $localConfig = @(
        "GRAPHITI_SERVICE_TOKEN=$(New-LocalSecret)",
        "GRAPHITI_GROUP_SECRET=$(New-LocalSecret)",
        "NEO4J_PASSWORD=$(New-LocalSecret)",
        'NEO4J_URI=bolt://127.0.0.1:7687',
        'OLLAMA_BASE_URL=http://127.0.0.1:11434/v1',
        'OLLAMA_MODEL=llama3.2:latest',
        'OLLAMA_EMBED_MODEL=nomic-embed-text',
        'GRAPHITI_TELEMETRY_ENABLED=false'
    )
    Set-Content -LiteralPath '.env' -Value $localConfig -Encoding utf8
    Write-Output 'Created services/graphiti/.env with independent local secrets.'
} else {
    Write-Output 'Existing services/graphiti/.env preserved.'
}

if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    uv venv .venv --python 3.13
    if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed' }
}
uv pip install --quiet --python .venv/Scripts/python.exe -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed' }
Write-Output 'Dependencies installed. Start Neo4j with docker compose up -d, then ./run-local.ps1.'

