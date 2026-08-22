#!/usr/bin/env bash
#
# GENESIS · Triviu · Polygon PoS (137)
#
# Um comando. Ele cria as duas chaves que faltam, ensaia contra um fork da Polygon, limpa o
# ensaio, para para voce conferir, roda o genesis de verdade e confere o resultado NA CHAIN.
#
#   bash script/genesis.sh
#
# Nenhuma chave privada e impressa nem passa por arquivo em texto: as duas nascem dentro de
# keystore cifrado do proprio Foundry, em ~/.foundry/keystores.
#
set -euo pipefail
cd "$(dirname "$0")/.."

# ---------------------------------------------------------------- o que ja se sabe -----------
# Safe conferido na chain: contrato, limiar 2 de 3 donos.
GOVERNANCE=0x73e344Be290c0D53Badbe528e45877296F6dAf6E
TREASURY=$GOVERNANCE

# USDC nativa da Polygon. Conferida on-chain: name "USD Coin", decimals 6.
BASE_TOKEN=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359

FEE_BPS=50
RPC_PUBLICO=https://polygon-bor-rpc.publicnode.com
GAS_GENESIS=10928358

DEPLOYER_ALIAS=triviu-deployer
OPERATOR_ALIAS=triviu-operator

azul()    { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
verde()   { printf '\033[0;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[0;33m%s\033[0m\n' "$*"; }
morre()   { printf '\n\033[0;31mPARADO: %s\033[0m\n' "$*" >&2; exit 1; }

# Uma a uma e com o nome ao lado do resultado. Um laco que imprime so "ok" varias vezes deixa
# passar a ferramenta que falta - foi assim que bc e jq escaparam da primeira conferencia.
for ferramenta in forge cast anvil awk grep tr wc; do
    command -v "$ferramenta" >/dev/null 2>&1 || morre "$ferramenta nao encontrado"
done

RPC="${POLYGON_RPC_URL:-$RPC_PUBLICO}"

azul "0 · Rede"
cast block-number --rpc-url "$RPC" >/dev/null 2>&1 || morre "RPC nao responde: $RPC"
verde "  bloco $(cast block-number --rpc-url "$RPC") · $RPC"

# ---------------------------------------------------------------- 1 · as duas chaves ---------
azul "1 · Chaves"

KEYSTORES="${HOME}/.foundry/keystores"

chave() {
    local alias=$1 papel=$2
    if [ -f "$KEYSTORES/$alias" ]; then
        verde "  $papel ja existe: $(cast wallet address --account "$alias")"
        return
    fi
    amarelo "  criando $papel ($alias) — escolha uma senha para o keystore"
    mkdir -p "$KEYSTORES"
    # PATH e ACCOUNT_NAME sao posicionais; a chave privada nasce cifrada e nunca e impressa.
    cast wallet new "$KEYSTORES" "$alias" >/dev/null
    verde "  $papel criado: $(cast wallet address --account "$alias")"
}

chave "$DEPLOYER_ALIAS" "deployer (descartavel)"
chave "$OPERATOR_ALIAS" "operator (chave quente do servico)"

DEPLOYER=$(cast wallet address --account "$DEPLOYER_ALIAS")
OPERATOR=$(cast wallet address --account "$OPERATOR_ALIAS")

[ "$DEPLOYER" != "$GOVERNANCE" ] || morre "deployer igual a governanca"
[ "$OPERATOR" != "$DEPLOYER"   ] || morre "operator igual ao deployer"
[ "$OPERATOR" != "$GOVERNANCE" ] || morre "operator igual a governanca"

# ---------------------------------------------------------------- 2 · o .env -----------------
azul "2 · Configuracao"
cat > .env <<EOF
POLYGON_RPC_URL=$RPC
GOVERNANCE=$GOVERNANCE
TREASURY=$TREASURY
OPERATOR=$OPERATOR
BASE_TOKEN=$BASE_TOKEN
FEE_BPS=$FEE_BPS
EOF
verde "  .env escrito (gitignored)"
printf '  governanca  %s  (Safe %s-de-%s)\n' "$GOVERNANCE" \
    "$(cast call "$GOVERNANCE" 'getThreshold()(uint256)' --rpc-url "$RPC")" \
    "$(cast call "$GOVERNANCE" 'getOwners()(address[])' --rpc-url "$RPC" | tr -cd ',' | wc -c | awk '{print $1+1}')"
printf '  tesouraria  %s\n  operador    %s\n  deployer    %s\n  moeda-base  %s (%s casas)\n  taxa        %s bps\n' \
    "$TREASURY" "$OPERATOR" "$DEPLOYER" "$BASE_TOKEN" \
    "$(cast call "$BASE_TOKEN" 'decimals()(uint8)' --rpc-url "$RPC")" "$FEE_BPS"

# ---------------------------------------------------------------- 3 · ensaio no fork ---------
azul "3 · Ensaio contra um fork da Polygon (nao gasta nada)"
anvil --fork-url "$RPC" --port 8545 --silent &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
sleep 12
cast block-number --rpc-url http://127.0.0.1:8545 >/dev/null || morre "anvil nao subiu"

set +e
forge script script/01_Deploy.s.sol --tc Deploy \
    --rpc-url http://127.0.0.1:8545 --account "$DEPLOYER_ALIAS" --broadcast >/tmp/genesis-ensaio.log 2>&1
ENSAIO=$?
set -e

# O fork se declara chain 137 e escreve nos MESMOS caminhos de um deploy real. Deixar isso para
# tras faz o repositorio afirmar um deploy de mainnet que nunca houve.
rm -rf deployments/137.json broadcast cache
kill $ANVIL 2>/dev/null || true
trap - EXIT

[ $ENSAIO -eq 0 ] || { tail -25 /tmp/genesis-ensaio.log; morre "o ensaio falhou — nada foi gasto"; }
verde "  ensaio completou · artefatos do fork removidos"

# ---------------------------------------------------------------- 4 · o custo ----------------
azul "4 · Custo e saldo"
GWEI=$(cast gas-price --rpc-url "$RPC")
CUSTO=$(cast --to-unit $((GAS_GENESIS * GWEI)) ether)
SALDO=$(cast balance "$DEPLOYER" --rpc-url "$RPC")
SALDO_POL=$(cast --to-unit "$SALDO" ether)
printf '  gas do genesis %s · preco %s gwei\n  custo estimado %s POL\n  saldo deployer %s POL\n' \
    "$GAS_GENESIS" "$(cast --to-unit "$GWEI" gwei)" "$CUSTO" "$SALDO_POL"

# awk e nao bc: bc nao existe neste ambiente, e o check que eu tinha antes imprimia cinco "ok"
# sem dizer qual ferramenta era qual, entao passou batido. Ferramenta se confere uma a uma.
if awk -v s="$SALDO_POL" -v c="$CUSTO" 'BEGIN { exit !(s < c * 1.5) }'; then
    amarelo ""
    amarelo "  Saldo insuficiente para o genesis com margem."
    amarelo "  Mande ao menos $(awk -v c="$CUSTO" 'BEGIN { printf "%.1f", c * 2 }') POL para:"
    amarelo "    $DEPLOYER"
    amarelo ""
    amarelo "  Depois rode este mesmo comando de novo: ele reaproveita as chaves e segue daqui."
    exit 0
fi

# ---------------------------------------------------------------- 5 · a decisao -------------
azul "5 · O genesis roda na Polygon de verdade agora"
amarelo "  As tres auditorias desta linha foram INTERNAS. Nao ha auditoria externa nem suite de"
amarelo "  fork contra venue real. Isso esta no SECURITY.md e nao muda por este script rodar."
printf '\n  Digite GENESIS para seguir: '
read -r OK
[ "$OK" = "GENESIS" ] || { echo "  abortado, nada foi gasto"; exit 0; }

forge script script/01_Deploy.s.sol --tc Deploy \
    --rpc-url "$RPC" --account "$DEPLOYER_ALIAS" --broadcast --slow

# ---------------------------------------------------------------- 6 · conferir na chain ------
azul "6 · Conferindo na chain, nao no log"
# grep e nao jq: jq nao existe neste ambiente. O registro e JSON plano de chave para endereco,
# entao recortar o endereco depois da chave e suficiente e nao carrega dependencia nova.
endereco_de() { grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"0x[a-fA-F0-9]\{40\}\"" deployments/137.json | grep -o '0x[a-fA-F0-9]\{40\}'; }

REG=$(endereco_de protocolRegistry)
EXEC=$(endereco_de executor)
Z=0x0000000000000000000000000000000000000000000000000000000000000000

[ -n "$REG" ]  || morre "nao achei protocolRegistry em deployments/137.json"
[ -n "$EXEC" ] || morre "nao achei executor em deployments/137.json"

confere() {
    local esperado=$1 rotulo=$2; shift 2
    local got; got=$(cast call "$@" --rpc-url "$RPC")
    if [ "$got" = "$esperado" ]; then verde "  ok    $rotulo = $got"
    else printf '\033[0;31m  FALHA %s = %s (esperado %s)\033[0m\n' "$rotulo" "$got" "$esperado"; FALHOU=1; fi
}

FALHOU=0
confere true  "moeda-base curada"   "$REG" 'isBaseCurrency(address)(bool)' "$BASE_TOKEN"
confere true  "executor curado"     "$REG" 'isExecutor(address)(bool)'     "$EXEC"
confere true  "operador"            "$REG" 'isOperator(address)(bool)'     "$OPERATOR"
confere true  "governanca e admin"  "$REG" 'hasRole(bytes32,address)(bool)' "$Z" "$GOVERNANCE"
confere false "deployer SEM admin"  "$REG" 'hasRole(bytes32,address)(bool)' "$Z" "$DEPLOYER"

[ $FALHOU -eq 0 ] || morre "o genesis nasceu torto — nao use estes enderecos"

azul "7 · Enderecos"
cat deployments/137.json

azul "Falta verificar os fontes no explorer:"
echo "  forge verify-contract <endereco> <Contrato> --chain polygon --watch"
echo
verde "A chave do deployer nao tem mais papel nenhum. Nao a reutilize."
