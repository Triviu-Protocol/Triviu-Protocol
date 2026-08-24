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

# Quem assina, e COMO. O deploy NAO precisa ser o dono do cofre -- precisa so de
# saldo em POL. `setStrategy`, depois, precisa do dono.
#
# Por padrao assina o alias do keystore. Mas a chave que TEM POL nem sempre esta
# no keystore: os tres aliases desta maquina nasceram do `cast wallet new` do
# genesis.sh e estao todos zerados, enquanto a carteira que implantou o protocolo
# inteiro (0xb5Fb..83C5, um dos tres donos da Safe 2-de-3) tem saldo de sobra e
# nao tem chave em disco -- de proposito.
#
# Sem esta rota, a unica saida era financiar uma conta nova. O genesis.sh ja
# tinha o padrao; este script nao tinha, e a falta virou recomendacao de mandar
# POL para um endereco que o dono nao reconhecia.
#
#   TRIVIU_DEPLOYER=0xb5Fb...83C5 TRIVIU_ASSINATURA=ledger      bash ... --broadcast
#   TRIVIU_DEPLOYER=0xb5Fb...83C5 TRIVIU_ASSINATURA=trezor      bash ... --broadcast
#   TRIVIU_DEPLOYER=0xb5Fb...83C5 TRIVIU_ASSINATURA=interativo  bash ... --broadcast
#   ACCOUNT=meu-alias                                           bash ... --broadcast
#
# `interativo` cola a chave privada no terminal e NAO grava nada em disco. E a
# rota de menor rastro para uma carteira de software, e ainda assim a chave passa
# pela tela -- prefira o aparelho quando houver um.
#
# Uma Safe NAO entra aqui: e contrato, exige 2 assinaturas e `execTransaction`.
# O `forge script` nao assina por ela.
ACCOUNT="${ACCOUNT:-triviu-deployer}"
DEPLOYER="${TRIVIU_DEPLOYER:-}"
ASSINATURA="${TRIVIU_ASSINATURA:-}"

montar_assinatura() {
  if [ -z "$DEPLOYER" ]; then
    FORGE_SIGN=(--account "$ACCOUNT")
    COMO="keystore, alias '$ACCOUNT'"
    QUEM=$(endereco_do_alias "$ACCOUNT")
    return
  fi

  QUEM="$DEPLOYER"
  case "$ASSINATURA" in
    ledger) FORGE_SIGN=(--ledger --sender "$DEPLOYER"); COMO="Ledger — a chave nao sai do aparelho" ;;
    trezor) FORGE_SIGN=(--trezor --sender "$DEPLOYER"); COMO="Trezor — a chave nao sai do aparelho" ;;
    # `-i` NAO recebe argumento. Quem recebe numero e `--interactives <N>`; passar
    # `-i 1` faz o forge ler o 1 como argumento do script e morrer com
    # "encode length mismatch". Custou uma execucao no genesis.sh para descobrir.
    *)      FORGE_SIGN=(-i --sender "$DEPLOYER"); COMO="interativo — a chave e colada e NAO fica em disco" ;;
  esac
}

# --- o saldo de quem ASSINA, conferido antes da senha ------------------------
#
# A primeira tentativa de broadcast pediu a senha, compilou, simulou, imprimiu o
# endereco previsto do contrato -- e so entao morreu com `insufficient funds for
# gas * price + value: balance 0`. Nada foi gasto, mas a senha foi digitada para
# nada e o erro chegou no ultimo passo possivel.
#
# A causa nao foi falta de fundos no projeto: foi conferir o saldo da conta
# ERRADA. O runbook desta onda tinha medido `2,673858 POL` e seguido em frente --
# esse e o saldo do DONO DO COFRE (0x930B..851a). Quem paga o deploy e o alias
# do keystore, e o `triviu-deployer` desta maquina e a chave DESCARTAVEL que o
# `genesis.sh` cria com `cast wallet new` quando o arquivo do alias nao existe:
# nasce com nonce 0 e zero POL. O proprio comentario duas linhas acima ja dizia
# que sao contas diferentes -- a distincao estava escrita e a verificacao foi
# feita do outro lado dela.
#
# Da para conferir SEM senha: o keystore v3 nao guarda o endereco em claro, mas o
# `genesis.sh` deixa os enderecos (que sao publicos) em `.genesis-enderecos`.
#
# Quando nao da para conferir (sem cache, alias fora dele, RPC mudo) isto AVISA e
# segue -- nao bloqueia. Um guarda que trava o deploy porque nao conseguiu ler um
# arquivo opcional custa mais do que o erro que evita.

GAS_DEPLOY=1285680   # medido no ensaio, nao estimado

# O keystore v3 nao guarda o endereco em claro, mas o genesis.sh deixa os
# enderecos (que sao publicos) em .genesis-enderecos. Da para resolver o alias
# SEM senha nenhuma. Devolve vazio quando nao consegue -- quem chama decide.
endereco_do_alias() {
  [ -f .genesis-enderecos ] || return 0
  grep -o "^$1=0x[a-fA-F0-9]\{40\}$" .genesis-enderecos 2>/dev/null | cut -d= -f2 | head -1 || true
}

conferir_saldo() {
  local end=$1 saldo pol preco preciso_wei preciso_pol

  [ -n "$end" ] || {
    echo ">>> nao sei o endereco de quem assina -- seguindo SEM conferir o saldo."
    return 0
  }

  # `cast` as vezes devolve valor E anotacao (`1000000 [1e6]`). Corta a anotacao.
  saldo=$(cast balance "$end" --rpc-url polygon 2>/dev/null | sed 's/ *\[.*//') || true
  preco=$(cast gas-price --rpc-url polygon 2>/dev/null | sed 's/ *\[.*//') || true
  [ -n "$saldo" ] && [ -n "$preco" ] || {
    echo ">>> nao consegui ler saldo/gas-price do RPC -- seguindo SEM conferir."
    return 0
  }

  # O forge exige que o saldo cubra gas * maxFeePerGas, e o maxFee que ele monta
  # fica perto de 2x a base fee. 3x o gas price cobre isso com folga; o excedente
  # nao e gasto, e devolvido pelo EIP-1559.
  # awk e nao $(( )): 1285680 * 274169140491 * 3 passa de 1e18 e estoura o inteiro
  # de 64 bits com sinal do bash. O double do awk erra ~100 wei nessa ordem de
  # grandeza -- ruido irrelevante para comparar contra um saldo.
  preciso_wei=$(awk -v g="$GAS_DEPLOY" -v p="$preco" 'BEGIN{printf "%.0f", g*p*3}')
  [ -n "$preciso_wei" ] || return 0

  pol=$(cast from-wei "$saldo")
  preciso_pol=$(cast from-wei "$preciso_wei")

  echo ">>>      saldo:   $pol POL"
  echo ">>>      preciso: ~$preciso_pol POL  ($GAS_DEPLOY de gas a $(( preco / 1000000000 )) gwei, com 3x de folga)"

  if awk -v a="$saldo" -v b="$preciso_wei" 'BEGIN{exit !(a+0 < b+0)}'; then
    echo
    echo "!!! SALDO INSUFICIENTE. Nada foi gasto e a senha nao foi pedida."
    echo "!!! Ou mande POL para $end, ou assine com uma carteira que ja tenha:"
    echo "!!!   TRIVIU_DEPLOYER=0x... TRIVIU_ASSINATURA=ledger bash $0 --broadcast"
    exit 1
  fi
  echo
}

# --- --------------------------------------------------------------------- ---

# O ensaio NAO passa --account, e isso e conserto e nao economia: `--account`
# pede a senha do keystore MESMO SEM --broadcast, entao um ensaio que a exige
# faz quem so queria conferir os numeros digitar a senha. Senha digitada por
# habito e senha digitada sem ler o que vem depois.
if [ "${1:-}" = "--broadcast" ]; then
  montar_assinatura
  echo ">>> BROADCAST: isto GASTA POL e implanta na Polygon."
  echo ">>> assinatura:  $COMO"
  echo ">>> quem assina: ${QUEM:-<so a senha revela>}"
  echo
  conferir_saldo "$QUEM"
  exec forge script script/strategy/DeployOracleFloorStrategy.s.sol \
    --tc DeployOracleFloorStrategy \
    --rpc-url polygon \
    "${FORGE_SIGN[@]}" \
    --broadcast
fi

echo ">>> ENSAIO: nada sai, e nao pede senha. Rode com --broadcast para implantar."
echo
exec forge script script/strategy/DeployOracleFloorStrategy.s.sol \
  --tc DeployOracleFloorStrategy \
  --rpc-url polygon
