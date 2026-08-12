#!/usr/bin/env bash
# Publica o codigo-fonte dos tres contratos no explorador · Polygon PoS (137)
# ==========================================================================
#
# Fecha a pendencia aberta desde o deploy: o polygon.ps1 so liga o --verify
# quando ETHERSCAN_API_KEY existe, ela estava vazia, o aviso amarelo apareceu e
# ninguem foi cobrado. Os tres subiram sem fonte publicada.
#
#     bash deploy/verificar-fontes.sh
#
# A chave e pedida por prompt e NAO passa por argumento de linha: argumento
# aparece em `ps` e no historico do shell; prompt e variavel de ambiente nao.
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
cd "$RAIZ"

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$*"; }

# ------------------------------------------------------- 0 · achar o Foundry
# forge/cast estao instalados nesta maquina e NAO estao no PATH de nenhum shell.
# ${USER:-} e nao $USER: com `set -u` uma variavel nao-definida aborta a
# expansao da lista inteira antes de testar qualquer caminho.
achar() {
  local nome="$1" p
  command -v "$nome" >/dev/null 2>&1 && { command -v "$nome"; return 0; }
  for p in "$HOME/.foundry/bin/$nome" "$HOME/.foundry/bin/$nome.exe" \
           "/c/Users/${USER:-${USERNAME:-x}}/.foundry/bin/$nome.exe" \
           "/opt/foundry/bin/$nome"; do
    [ -x "$p" ] && { printf '%s' "$p"; return 0; }
  done
  return 1
}
FORGE="$(achar forge)" || { vermelho "forge nao encontrado nem no PATH nem em ~/.foundry/bin"; exit 2; }
verde "forge .................... $FORGE"

# -------------------------------------------------------------- 1 · a chave
[ -f "$AQUI/mainnet.env" ] || { vermelho "falta $AQUI/mainnet.env"; exit 2; }
set -a; . "$AQUI/mainnet.env"; set +a
: "${CHAIN_RPC:?CHAIN_RPC vazio em mainnet.env}"

if [ -z "${ETHERSCAN_API_KEY:-}" ]; then
  echo
  amarelo "ETHERSCAN_API_KEY esta vazia em mainnet.env."
  echo "  Pegue uma em https://etherscan.io/register -> API Keys -> Add."
  echo "  A MESMA chave serve para a Polygon (Etherscan v2, chainid=137)."
  echo
  printf '  Cole a chave e tecle Enter (nao vai aparecer na tela): '
  read -r -s ETHERSCAN_API_KEY
  echo
  [ -n "$ETHERSCAN_API_KEY" ] || { vermelho "chave vazia · abortado"; exit 1; }

  # Grava sem duplicar a linha, e sem nunca ecoar o valor.
  TMP="$(mktemp)"
  grep -v '^ETHERSCAN_API_KEY=' "$AQUI/mainnet.env" > "$TMP" 2>/dev/null || true
  printf 'ETHERSCAN_API_KEY=%s\n' "$ETHERSCAN_API_KEY" >> "$TMP"
  mv "$TMP" "$AQUI/mainnet.env"
  chmod 600 "$AQUI/mainnet.env" 2>/dev/null || true
  export ETHERSCAN_API_KEY
  verde "chave gravada em mainnet.env (que esta no .gitignore)"
fi
verde "chave .................... ${#ETHERSCAN_API_KEY} caracteres"

# ------------------------------------------- 2 · verificar os tres contratos
# Os argumentos de construtor vieram do broadcast do deploy, nao de memoria:
#   ParameterRegistry(uint16 30, uint256 3100000000000000)
#   TriviuExecutor(address <registry>)
#   GasTank()  sem argumentos
REG=0x1Adab61ef019d853BBcFaf65E929961b11897856
EXE=0xEdB5Aa01fd055B3755439cE41B92b575eea1d273
GAS=0xFF0Dc2fC461E28bbAC7964496535989311e93f56
FALHAS=0

verificar() {
  local addr="$1" alvo="$2"; shift 2
  echo
  echo "--- $alvo em $addr"
  if "$FORGE" verify-contract "$addr" "$alvo" --chain 137 --watch "$@"; then
    verde "  publicado"
  else
    vermelho "  FALHOU"
    FALHAS=$((FALHAS+1))
  fi
}

CAST="$(achar cast)" || { vermelho "cast nao encontrado"; exit 2; }

# Conferido: estes bytes batem com o FIM do initcode que foi realmente
# implantado (broadcast/Deploy.s.sol/137/run-latest.json). Nao e "o broadcast
# diz que os argumentos foram estes" — e os bytes conferindo com a chain.
ARGS_REG="$("$CAST" abi-encode 'c(uint16,uint256)' 30 3100000000000000)"
ARGS_EXE="$("$CAST" abi-encode 'c(address)' "$REG")"

verificar "$REG" src/ParameterRegistry.sol:ParameterRegistry --constructor-args "$ARGS_REG"
verificar "$EXE" src/TriviuExecutor.sol:TriviuExecutor      --constructor-args "$ARGS_EXE"
verificar "$GAS" src/GasTank.sol:GasTank

# ------------------------------------------------------- 3 · conferir mesmo
# Nao acredita no proprio exit code: pergunta ao explorador.
echo
echo "=== conferindo contra o Polygonscan ==="
bash "$AQUI/conferir-deploy.sh"
CONF=$?

echo
if [ "$CONF" -eq 0 ]; then
  verde "=== os tres estao com fonte publicada ==="
  echo
  amarelo "FALTA UM PASSO, E E DE TEXTO:"
  echo "  A frase 'the Executor, Registry and Gas-Tank are verified on the block"
  echo "  explorer' foi RETIRADA de site/learn/safety/index.html porque era falsa."
  echo "  Agora ela pode voltar. Peca a devolucao dela."
  exit 0
else
  vermelho "=== a conferencia ainda acusa pendencia (ver acima) ==="
  exit 1
fi
