#!/usr/bin/env bash
# Implanta OracleFloorStrategy na Polygon com os argumentos RATIFICADOS.
#
#   bash script/strategy/deploy-oracle-floor.sh              -> ensaio, nada sai
#   bash script/strategy/deploy-oracle-floor.sh --broadcast  -> implanta de verdade
#
# POR QUE ISTO EXISTE E NAO UM COMANDO COLADO A MAO: a primeira tentativa foi um
# one-liner de PowerShell colado num Git Bash. As onze variaveis viraram
# "command not found", o script reverteu na primeira que faltava, e a mensagem
# ("environment variable ASSET not found") acusava o script em vez da concha.
# Nada foi gasto porque o revert veio antes do broadcast -- mas a proxima falha
# desse tipo pode nao ter essa sorte. Argumento ratificado mora em arquivo.
#
# NAO conecta nada ao cofre. `setStrategy` e um passo separado, de proposito:
# ele incrementa o configEpoch e invalida toda proposta ja montada contra a
# estrategia antiga. Separar deixa uma janela para chamar `propose()` na nova em
# modo leitura e comparar antes que qualquer coisa dependa dela.

set -euo pipefail

cd "$(dirname "$0")/../.."

# --- os argumentos, e de onde cada um veio -----------------------------------

export ASSET=0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270          # WMATIC
export BASE=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359           # USDC nativo
export ASSET_DECIMALS=18
export BASE_DECIMALS=6
export ASSET_FEED=0xAB594600376Ec9fD91F8e885dADF0CE036862dE0     # MATIC/USD, 8 casas
export BASE_FEED=0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7      # USDC/USD, 8 casas
export TICKET=100000                                             # 0,1 USDC

# 3600 s = 80x o maior buraco entre publicacoes observado em 4,38 dias (45 s),
# medido por `getRoundData` caminhando rodadas para tras -- estado atual, sem
# archive e sem amostragem. Folgado de proposito: MAX_AGE curto CONGELA o cofre
# quando nao ha problema nenhum, e essa e a pior das duas falhas porque acontece
# no momento em que ninguem esta procurando defeito.
export MAX_AGE=3600

# 1800 bps ratificado pelo Apex T7. Vida util medida sobre 4.317 pontos horarios:
# 30 dias na compra, 21 na venda -- a cadencia de reimplantacao segue a perna
# curta. O joelho da curva e 18%: de 16% para 18% a vida util salta 4,3x.
export BUY_TOLERANCE_BPS=1800
export SELL_TOLERANCE_BPS=1800

# 3000 bps ratificado pelo Apex T7: "margem de erro de ate 30%, se por acaso nao
# bater, reverter, para nao se arriscar de forma que gere prejuizo nao coberto".
# Zero reproduziria a politica da ExampleStrategy (nunca realiza prejuizo).
export MAX_LOSS_BPS=3000

# Alias do keystore que assina. O deploy NAO precisa ser o dono do cofre --
# precisa so de saldo em POL. `setStrategy`, depois, precisa do dono.
ACCOUNT="${ACCOUNT:-triviu-deployer}"

# --- --------------------------------------------------------------------- ---

# O ensaio NAO passa --account, e isso e conserto e nao economia: `--account`
# pede a senha do keystore MESMO SEM --broadcast, entao um ensaio que a exige
# faz quem so queria conferir os numeros digitar a senha. Senha digitada por
# habito e senha digitada sem ler o que vem depois.
if [ "${1:-}" = "--broadcast" ]; then
  echo ">>> BROADCAST: isto GASTA POL e implanta na Polygon."
  echo ">>> assinando com o alias: $ACCOUNT"
  echo
  exec forge script script/strategy/DeployOracleFloorStrategy.s.sol \
    --tc DeployOracleFloorStrategy \
    --rpc-url polygon \
    --account "$ACCOUNT" \
    --broadcast
fi

echo ">>> ENSAIO: nada sai, e nao pede senha. Rode com --broadcast para implantar."
echo
exec forge script script/strategy/DeployOracleFloorStrategy.s.sol \
  --tc DeployOracleFloorStrategy \
  --rpc-url polygon
