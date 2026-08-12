# Triviu . deploy Polygon PoS . Registry -> Executor -> GasTank
# PowerShell. Rode de dentro de triviu\public\contracts:
#     .\deploy\polygon.ps1
#
# A CHAVE PRIVADA nao entra em arquivo nem em argumento. O forge pede no prompt
# com --interactive, usa e esquece. Argumento aparece em `ps` e no historico;
# prompt interativo nao aparece em lugar nenhum.

$ErrorActionPreference = "Stop"

$MULTISIG = "0x73e344Be290c0D53Badbe528e45877296F6dAf6E"
$ACK      = "audit-and-trust-gates-done"
$LAUDO    = "03952dd"

function Verde($m)    { Write-Host $m -ForegroundColor Green }
function Vermelho($m) { Write-Host $m -ForegroundColor Red }
function Amarelo($m)  { Write-Host $m -ForegroundColor Yellow }

Write-Host "=============================================================="
Write-Host " TRIVIU . deploy Polygon PoS . Registry -> Executor -> GasTank"
Write-Host "=============================================================="

# 0 . ferramentas
$env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"
if (-not (Get-Command forge -ErrorAction SilentlyContinue)) {
  Vermelho "FALTA o forge. Instale no Git Bash:"
  Write-Host "    curl -L https://foundry.paradigm.xyz | bash"
  Write-Host "    foundryup --install v1.7.1"
  exit 1
}
Verde ("Foundry .................. " + ((forge --version) -split "`n")[0])

# 1 . segredos do .env (nunca por argumento)
$envFile = Join-Path $PSScriptRoot "mainnet.env"
if (-not (Test-Path $envFile)) { Vermelho "FALTA $envFile"; exit 1 }
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $nome = $matches[1]; $valor = $matches[2].Trim()
    if ($valor) { Set-Item -Path "env:$nome" -Value $valor }
  }
}
if (-not $env:CHAIN_RPC) { Vermelho "CHAIN_RPC vazio em mainnet.env"; exit 1 }
$hostRpc = ([uri]$env:CHAIN_RPC).Host
Verde "RPC ...................... host $hostRpc  (URL nunca ecoada)"

# 2 . o laudo cobre os CONTRATOS? (nao "o hash do HEAD bate")
$delta = (git diff --numstat "$LAUDO..HEAD" -- src/ | Measure-Object -Line).Lines
if ($delta -eq 0) {
  Verde "Laudo D2 ................. cobre os contratos (src/ intacto desde $LAUDO)"
} else {
  Vermelho "Laudo D2 ................. NAO cobre: $delta arquivo(s) de src/ mudaram"
  git diff --numstat "$LAUDO..HEAD" -- src/
  $r = Read-Host "   Seguir assim mesmo? (digite: eu-assumo)"
  if ($r -ne "eu-assumo") { Vermelho "abortado"; exit 1 }
}

# 3 . a suite antes de tocar na chain
Write-Host "Rodando a suite..."
forge test *> $null
if ($LASTEXITCODE -ne 0) { Vermelho "forge test ............... VERMELHO - abortado"; exit 1 }
Verde "forge test ............... verde"

# 4 . o Safe existe e e contrato?
$codigo = cast code $MULTISIG --rpc-url $env:CHAIN_RPC
if ($codigo.Length -le 2) { Vermelho "Safe ..................... SEM CODIGO. Abortado."; exit 1 }
$limiar = cast call $MULTISIG "getThreshold()(uint256)" --rpc-url $env:CHAIN_RPC
Verde "Safe ..................... contrato . threshold $limiar"
if ($limiar -eq "1") {
  Amarelo "  RESSALVA RATIFICADA: 1 de 1 e chave unica em efeito."
  Amarelo "  O endereco do Safe NAO muda ao subir para 2/3 depois."
}

# 5 . o salto
Write-Host ""
Write-Host "--- vai implantar em POLYGON MAINNET (chain 137) ---"
Write-Host "  Registry -> Executor -> GasTank"
Write-Host "  posse repassada para $MULTISIG (o Safe aceita depois)"
Write-Host "  taxa nasce DESLIGADA . whitelists nascem VAZIAS"
$c = Read-Host "  Confirma? (digite: deploy)"
if ($c -ne "deploy") { Vermelho "abortado"; exit 1 }

$env:TRIVIU_OWNER_MULTISIG = $MULTISIG
$env:TRIVIU_MAINNET_ACK    = $ACK

$log = Join-Path $PSScriptRoot ("deploy-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
Amarelo "O forge vai pedir a CHAVE PRIVADA agora. Ela nao fica gravada em lugar nenhum."

$argsForge = @("script","script/Deploy.s.sol","--rpc-url",$env:CHAIN_RPC,"--broadcast","--interactive")
if ($env:ETHERSCAN_API_KEY) { $argsForge += "--verify"; Verde "--verify ligado (Polygonscan)" }
else { Amarelo "sem ETHERSCAN_API_KEY -> segue SEM --verify. Verificar depois com forge verify-contract." }

& forge @argsForge 2>&1 | Tee-Object -FilePath $log

Write-Host ""
Verde "Saida completa em $log"
Amarelo "=============================================================="
Amarelo " FALTA A PERNA 2, E ELA E SUA E OBRIGATORIA"
Amarelo "=============================================================="
Write-Host " Em app.safe.global, com o Safe $MULTISIG :"
Write-Host "   Para:   <endereco do ParameterRegistry impresso acima>"
Write-Host "   Funcao: acceptOwner()"
Write-Host ""
Write-Host " Sem isso a posse fica pendurada e o dono continua sendo a"
Write-Host " carteira que assinou - o oposto do que o gate garante."
