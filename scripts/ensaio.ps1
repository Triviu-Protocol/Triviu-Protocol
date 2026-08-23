<#
  UM COMANDO: sobe o fork da Polygon, roda o ciclo inteiro do console contra ele,
  e derruba o fork. Nao gasta nada e nao toca em carteira nenhuma.

      powershell -ExecutionPolicy Bypass -File scripts\ensaio.ps1

  Tres coisas aqui foram aprendidas errando, e estao escritas para nao se
  perderem:

  1. SEM --silent. Com ele, quando o anvil nao sobe, a mensagem e o silencio: o
     ensaio dizia "o fork nao respondeu em 60s" enquanto o anvil estava vivo.
  2. COM --fork-block-number. Sem fixar o bloco, o no publico poda o estado
     historico enquanto o fork roda, e a falha aparece no meio do ciclo como
     "historical state is not available" — que se le como defeito do produto.
  3. FORK NOVO A CADA VEZ. Um fork guarda o que a execucao anterior fez nele.
     A primeira vez que isto rodou, uma transacao foi minerada depois de o script
     ter desistido, e a rodada seguinte reverteu com FailedDeployment() — o
     CREATE2 dizendo que ja havia codigo naquele endereco.
#>
$ErrorActionPreference = "Stop"
$PORTA = 8901
$RPC   = "https://polygon-bor-rpc.publicnode.com"
$RAIZ  = Split-Path -Parent $PSScriptRoot

Write-Host "1 - derrubando qualquer no antigo na porta $PORTA"
Get-NetTCPConnection -LocalPort $PORTA -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

$r = Invoke-RestMethod -Uri $RPC -Method Post -ContentType "application/json" `
  -Body '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
$bloco = [Convert]::ToInt64($r.result.Substring(2), 16)
$alvo  = $bloco - 6
Write-Host "2 - bloco de mainnet $bloco - fixando a fork em $alvo"

$anvil = Start-Process -PassThru -WindowStyle Hidden -FilePath "anvil" `
  -ArgumentList "--fork-url", $RPC, "--fork-block-number", "$alvo", "--port", "$PORTA" `
  -RedirectStandardOutput "$env:TEMP\triviu-anvil.out" -RedirectStandardError "$env:TEMP\triviu-anvil.err"

$pronto = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 3
  try {
    $c = Invoke-RestMethod -Uri "http://127.0.0.1:$PORTA" -Method Post -ContentType "application/json" `
      -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' -TimeoutSec 6
    $cid = [Convert]::ToInt64($c.result.Substring(2), 16)
    if ($cid -ne 137) { throw "o no na porta $PORTA serve a chain $cid, nao a 137" }
    Write-Host "3 - fork de pe servindo a chain $cid"
    $pronto = $true; break
  } catch { }
}
if (-not $pronto) {
  Write-Host "FALHOU: a fork nao subiu. Saida do anvil:" -ForegroundColor Red
  Get-Content "$env:TEMP\triviu-anvil.err" -TotalCount 20 -ErrorAction SilentlyContinue
  if ($anvil -and -not $anvil.HasExited) { Stop-Process -Id $anvil.Id -Force }
  exit 1
}

Write-Host "4 - rodando o ciclo com a calldata do console"
Write-Host ""
Push-Location $RAIZ
try {
  node scripts/ensaio-console-fork.mjs --porta $PORTA @args
  $codigo = $LASTEXITCODE
  Write-Host ""
  Write-Host "5 - dirigindo o console: DOM, handlers e estado"
  Write-Host ""
  # Os DOIS ensaios contra a MESMA fork fixada. O de calldata prova os bytes; o
  # de fluxo prova a maquina de estado. Rodar so um deixa a outra metade sendo
  # descoberta pelo fundador, que foi como se chegou ate aqui.
  node scripts/ensaio-fluxo-console.mjs --porta $PORTA
  if ($LASTEXITCODE -ne 0) { $codigo = $LASTEXITCODE }
}
finally { Pop-Location }

Write-Host ""
Write-Host "6 - derrubando a fork"
if ($anvil -and -not $anvil.HasExited) { Stop-Process -Id $anvil.Id -Force }
exit $codigo
