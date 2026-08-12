#!/usr/bin/env bash
# Deploy do trio Triviu na Polygon PoS · Registry -> Executor -> GasTank
#
# NENHUM SEGREDO PASSA POR ARGUMENTO. A chave privada vive em keystore cifrado
# do foundry e o forge pede a senha na hora; o RPC e a chave do Polygonscan vem
# de `mainnet.env`, que esta no .gitignore. Argumento de linha aparece em `ps` e
# no historico do shell — variavel de ambiente e prompt interativo nao aparecem.
#
# Rode de dentro de triviu/public/contracts:
#     bash deploy/polygon.sh
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
cd "$RAIZ"

MULTISIG=0x73e344Be290c0D53Badbe528e45877296F6dAf6E
ACK=audit-and-trust-gates-done
LAUDO_COMMIT=03952dd

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$*"; }

echo "=============================================================="
echo " TRIVIU · deploy Polygon PoS · Registry -> Executor -> GasTank"
echo "=============================================================="

# ------------------------------------------------------------ 0 · ferramentas
# Sem isto o script morre com "command not found" no meio, depois de a pessoa ja
# ter aberto o gerenciador de senhas. Falha cedo e com a instrucao na mao.
for FERR in forge cast; do
  if ! command -v "$FERR" >/dev/null 2>&1; then
    vermelho "FALTA o $FERR (Foundry) nesta maquina."
    echo
    echo "  Instale com uma linha, aqui mesmo no Git Bash:"
    echo "      curl -L https://foundry.paradigm.xyz | bash"
    echo "      source ~/.bashrc   # ou abra um Git Bash novo"
    echo "      foundryup --version v1.7.1"
    echo
    echo "  A versao v1.7.1 e a MESMA que o CI usa. Fixar a versao importa:"
    echo "  bytecode compilado por outra versao nao bate com o que foi auditado."
    echo
    echo "  Alternativa: rodar o deploy da VPS de build, que ja tem o forge"
    echo "  v1.7.1 em /opt/foundry/bin. Nesse caso a sua chave privada passa a"
    echo "  viver no keystore DA VPS, e nao no seu computador — decida qual dos"
    echo "  dois voce prefere guardando a chave."
    exit 1
  fi
done
verde "Foundry .................. $(forge --version 2>/dev/null | head -1)"

# ---------------------------------------------------------------- 1 · segredos
if [ ! -f "$AQUI/mainnet.env" ]; then
  vermelho "FALTA $AQUI/mainnet.env"
  echo "  cp deploy/mainnet.env.exemplo deploy/mainnet.env"
  echo "  chmod 600 deploy/mainnet.env    # so voce le"
  echo "  # preencha CHAIN_RPC e ETHERSCAN_API_KEY"
  exit 1
fi
set -a; . "$AQUI/mainnet.env"; set +a
: "${CHAIN_RPC:?CHAIN_RPC vazio em mainnet.env}"
: "${ETHERSCAN_API_KEY:?ETHERSCAN_API_KEY vazio em mainnet.env}"
CONTA_DEPLOY="${CONTA_DEPLOY:-triviu-deploy}"

# So o host. A URL inteira carrega a chave e nunca e ecoada.
HOST_RPC="$(printf '%s' "$CHAIN_RPC" | sed -E 's#^[a-z]+://([^/]+).*#\1#')"
verde "RPC ...................... host $HOST_RPC  (URL nunca ecoada)"

# ------------------------------------------------------- 2 · keystore cifrado
if ! cast wallet list 2>/dev/null | grep -qx "$CONTA_DEPLOY"; then
  amarelo "Keystore '$CONTA_DEPLOY' nao existe. Criando agora."
  echo "  O prompt pede a CHAVE PRIVADA e depois uma SENHA."
  echo "  A chave e cifrada com a senha e gravada em ~/.foundry/keystores/."
  echo "  Ela nao fica em texto puro em lugar nenhum, e nao entra no historico."
  cast wallet import "$CONTA_DEPLOY" --interactive
fi
ENDERECO_DEPLOY="$(cast wallet address --account "$CONTA_DEPLOY" 2>/dev/null || true)"
verde "Carteira que assina ...... ${ENDERECO_DEPLOY:-<informada na senha>}"

# ------------------------------------------------------------- 3 · pre-flight
echo
echo "--- pre-flight (Art. 3 fase 1 do Leao) ---"

# A pergunta certa nao e "o HEAD e o mesmo commit do laudo?" — e "os CONTRATOS
# que vao para a chain mudaram desde o laudo?". Medido em 2026-08-11: 21 commits
# depois do laudo e ZERO linha alterada em src/. O que mudou foi o proprio
# Deploy.s.sol, e mudou para ADICIONAR o gate de multisig e o de ACK.
HEAD_ATUAL="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
DELTA_SRC="$(git diff --numstat "$LAUDO_COMMIT..HEAD" -- src/ 2>/dev/null | wc -l)"
if [ "$DELTA_SRC" = "0" ]; then
  verde "Laudo D2 ................. cobre os contratos (src/ intacto desde $LAUDO_COMMIT)"
  [ "$HEAD_ATUAL" != "$LAUDO_COMMIT" ] &&     amarelo "  HEAD e $HEAD_ATUAL, nao $LAUDO_COMMIT — mas nenhuma linha de src/ mudou."
else
  vermelho "Laudo D2 ................. NAO cobre: $DELTA_SRC arquivo(s) de src/ mudaram"
  git diff --numstat "$LAUDO_COMMIT..HEAD" -- src/ | sed 's/^/   /'
  echo "   O que vai a mainnet NAO e o que foi auditado."
  read -r -p "   Seguir assim mesmo? (digite: eu-assumo) " R
  [ "$R" = "eu-assumo" ] || { vermelho "abortado"; exit 1; }
fi

echo "Rodando a suite antes de tocar na chain..."
forge test >/dev/null 2>&1 && verde "forge test ............... verde" || {
  vermelho "forge test ............... VERMELHO — abortado"; exit 1; }

SALDO_WEI="$(cast balance "$ENDERECO_DEPLOY" --rpc-url "$CHAIN_RPC" 2>/dev/null || echo 0)"
SALDO_POL="$(cast from-wei "$SALDO_WEI" 2>/dev/null || echo 0)"
if [ "$SALDO_WEI" = "0" ]; then
  vermelho "Saldo .................... ZERO POL — o deploy vai falhar por gas"
  exit 1
fi
verde "Saldo .................... $SALDO_POL POL"

CODIGO_SAFE="$(cast code "$MULTISIG" --rpc-url "$CHAIN_RPC" 2>/dev/null || echo 0x)"
if [ "${#CODIGO_SAFE}" -le 2 ]; then
  vermelho "Safe ..................... SEM CODIGO — nao e contrato. Abortado."
  exit 1
fi
LIMIAR="$(cast call "$MULTISIG" 'getThreshold()(uint256)' --rpc-url "$CHAIN_RPC" 2>/dev/null || echo '?')"
DONOS="$(cast call "$MULTISIG" 'getOwners()(address[])' --rpc-url "$CHAIN_RPC" 2>/dev/null | tr -cd ',' | wc -c)"
verde "Safe ..................... contrato · threshold $LIMIAR · $((DONOS+1)) dono(s)"
if [ "$LIMIAR" = "1" ]; then
  amarelo "  RESSALVA RATIFICADA: 1 de 1 e chave unica em efeito."
  amarelo "  Comprometido o dono, comprometem-se aliquota, tesouraria e whitelist."
  amarelo "  O endereco do Safe NAO muda ao subir para 2/3 depois."
fi

# --------------------------------------------------------------- 4 · o salto
echo
echo "--- vai implantar em POLYGON MAINNET (chain 137) ---"
echo "  Registry -> Executor -> GasTank"
echo "  posse repassada para $MULTISIG (2 pernas: o Safe aceita depois)"
echo "  taxa nasce DESLIGADA · whitelists nascem VAZIAS"
read -r -p "  Confirma? (digite: deploy) " C
[ "$C" = "deploy" ] || { vermelho "abortado"; exit 1; }

export TRIVIU_OWNER_MULTISIG="$MULTISIG"
export TRIVIU_MAINNET_ACK="$ACK"

SAIDA="$AQUI/deploy-$(date +%Y%m%d-%H%M%S).log"
forge script script/Deploy.s.sol \
  --rpc-url "$CHAIN_RPC" \
  --broadcast \
  --verify \
  --account "$CONTA_DEPLOY" \
  2>&1 | tee "$SAIDA"

echo
verde "Saida completa em $SAIDA"
echo
amarelo "=============================================================="
amarelo " FALTA A PERNA 2, E ELA E SUA E OBRIGATORIA"
amarelo "=============================================================="
echo " Em app.safe.global, com o Safe $MULTISIG:"
echo "   Para:   <endereco do ParameterRegistry impresso acima>"
echo "   Funcao: acceptOwner()"
echo
echo " Sem isso a posse fica pendurada e o dono continua sendo"
echo " $ENDERECO_DEPLOY — o oposto do que o gate garante."
echo
echo " Depois confirme:"
echo "   cast call <registry> 'owner()(address)'        --rpc-url \"\$CHAIN_RPC\""
echo "   cast call <registry> 'pendingOwner()(address)' --rpc-url \"\$CHAIN_RPC\""
echo "   owner tem de ser o Safe · pendingOwner tem de ser 0x0"
