#!/usr/bin/env bash
#
# ONBOARDING DE CLIENTE · Triviu · Polygon PoS (137)
#
# Roda os nove passos do fluxo contra os contratos VIVOS, como um cliente novo faria. Nao e o
# dono do protocolo criando um cofre para si: e uma carteira virgem percorrendo o caminho que a
# pasta entrega. Endereco novo nao tem estado anterior, entao nada passa por acidente.
#
#   bash script/cliente.sh
#
# Para usar uma carteira que voce ja tem, em vez da nova:
#   TRIVIU_CLIENTE=0xSeuEndereco bash script/cliente.sh     (o forge pede a chave na hora)
#
set -euo pipefail
cd "$(dirname "$0")/.."

# ------------------------------------------------------------------ parametros do teste ------
ASSET=0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270        # WMATIC
BASE=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359         # USDC nativa, a moeda-base curada
TICKET=100000                                            # 0,10 USDC por compra
DEPOSITO=1000000                                         # 1,00 USDC
MIN_OUT_PER_TICKET=880000000000000000                    # 0,88 WMATIC por ticket

# Cotado na QuickSwap no dia: 0,10 USDC rendia 0,9314 WMATIC. 0,88 e ~5,5% de tolerancia -
# aperta o bastante para recusar preenchimento ruim, folga o bastante para movimento normal.
# NAO deixe isto em zero: o construtor recusa, e a razao esta no README.

COOLDOWN=3600
MAX_VALIDITY=900
MIN_RATIO_BPS=0     # o piso que vale e o da estrategia, acima. Ver README, secao Trust model.
QUANTUM=0
VAULT_INDEX=0

RPC_PUBLICO=https://polygon-bor-rpc.publicnode.com
CLIENTE_ALIAS=triviu-cliente
CACHE=.genesis-enderecos
KEYSTORES="${HOME}/.foundry/keystores"
GAS_FLUXO=1400000

azul()    { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
verde()   { printf '\033[0;32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[0;33m%s\033[0m\n' "$*"; }
morre()   { printf '\n\033[0;31mPARADO: %s\033[0m\n' "$*" >&2; exit 1; }

for f in forge cast anvil awk grep; do
    command -v "$f" >/dev/null 2>&1 || morre "$f nao encontrado"
done

RPC="${POLYGON_RPC_URL:-$RPC_PUBLICO}"
[ -f deployments/137.json ] || morre "deployments/137.json nao existe — o genesis rodou?"

FACTORY=$(grep -o '"factory"[[:space:]]*:[[:space:]]*"0x[a-fA-F0-9]\{40\}"' deployments/137.json | grep -o '0x[a-fA-F0-9]\{40\}')
REG=$(grep -o '"protocolRegistry"[[:space:]]*:[[:space:]]*"0x[a-fA-F0-9]\{40\}"' deployments/137.json | grep -o '0x[a-fA-F0-9]\{40\}')

azul "0 · Contra o que este teste roda"
verde "  factory  $FACTORY"
verde "  registry $REG"
verde "  bloco    $(cast block-number --rpc-url "$RPC")"

# ------------------------------------------------------------------ 1 · o cliente -------------
azul "1 · A carteira do cliente"
so_endereco() { grep -o '0x[a-fA-F0-9]\{40\}' | head -1; }

if [ -n "${TRIVIU_CLIENTE:-}" ]; then
    CLIENTE="$TRIVIU_CLIENTE"
    FORGE_SIGN=(-i)
    verde "  sua carteira: $CLIENTE  ·  assinatura interativa, nada em disco"
elif cacheado=$(grep -o "^$CLIENTE_ALIAS=0x[a-fA-F0-9]\{40\}$" "$CACHE" 2>/dev/null | cut -d= -f2 | head -1) && [ -n "$cacheado" ]; then
    CLIENTE="$cacheado"
    FORGE_SIGN=(--account "$CLIENTE_ALIAS")
    verde "  cliente: $CLIENTE  (do cache, sem senha)"
else
    amarelo "  criando uma carteira NOVA para o cliente — escolha uma senha:"
    mkdir -p "$KEYSTORES"
    CLIENTE=$(cast wallet new "$KEYSTORES" "$CLIENTE_ALIAS" 2>&1 | so_endereco)
    [ -n "$CLIENTE" ] || morre "nao consegui criar a carteira do cliente"
    printf '%s=%s\n' "$CLIENTE_ALIAS" "$CLIENTE" >> "$CACHE"
    FORGE_SIGN=(--account "$CLIENTE_ALIAS")
    verde "  cliente: $CLIENTE"
fi

COFRE=$(cast call "$FACTORY" 'vaultAddress(address,uint256)(address)' "$CLIENTE" "$VAULT_INDEX" --rpc-url "$RPC")
verde "  o cofre dele nascera em $COFRE  (CREATE2, previsto antes de existir)"

# ------------------------------------------------------------------ 2 · fundos ----------------
azul "2 · O que a carteira precisa ter"
POL=$(cast balance "$CLIENTE" --rpc-url "$RPC")
USD=$(cast call "$BASE" 'balanceOf(address)(uint256)' "$CLIENTE" --rpc-url "$RPC" | awk '{print $1}')
GWEI=$(cast gas-price --rpc-url "$RPC")
CUSTO=$(cast --to-unit $((GAS_FLUXO * GWEI)) ether)
POL_TEM=$(cast --to-unit "$POL" ether)

printf '  gas do fluxo   %s a %s gwei -> %s POL\n' "$GAS_FLUXO" "$(cast --to-unit "$GWEI" gwei)" "$CUSTO"
printf '  POL na carteira  %s\n' "$POL_TEM"
printf '  USDC na carteira %s  (precisa de %s)\n' "$(cast --to-unit "$USD" mwei)" "$(cast --to-unit "$DEPOSITO" mwei)"

FALTA=0
awk -v s="$POL_TEM" -v c="$CUSTO" 'BEGIN { exit !(s < c * 1.5) }' && { amarelo "  falta POL"; FALTA=1; }
[ "$USD" -ge "$DEPOSITO" ] || { amarelo "  falta USDC"; FALTA=1; }

if [ "$FALTA" = "1" ]; then
    amarelo ""
    amarelo "  Mande para $CLIENTE :"
    amarelo "    $(awk -v c="$CUSTO" 'BEGIN { printf "%.1f", c * 2 }') POL   e   $(cast --to-unit "$DEPOSITO" mwei) USDC"
    amarelo "  Depois rode o mesmo comando: ele reaproveita a carteira e segue daqui."
    exit 0
fi

# ------------------------------------------------------------------ 3 · .env -----------------
cat > .env <<EOF
POLYGON_RPC_URL=$RPC
ASSET=$ASSET
TICKET=$TICKET
MIN_OUT_PER_TICKET=$MIN_OUT_PER_TICKET
COOLDOWN=$COOLDOWN
MAX_VALIDITY=$MAX_VALIDITY
MIN_RATIO_BPS=$MIN_RATIO_BPS
QUANTUM=$QUANTUM
DEPOSIT_AMOUNT=$DEPOSITO
VAULT_INDEX=$VAULT_INDEX
EOF

# ------------------------------------------------------------------ 4 · ensaio ----------------
azul "3 · Ensaio contra um fork da Polygon (nao gasta nada)"
BLOCO=$(cast block-number --rpc-url "$RPC")
anvil --fork-url "$RPC" --fork-block-number $((BLOCO - 30)) --port 8545 --silent &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
sleep 12
cast balance "$CLIENTE" --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1 || morre "o fork nao serviu — rode de novo"

set +e
POLYGON_RPC_URL=http://127.0.0.1:8545 forge script script/user/UserFlow.s.sol --tc UserFlow \
    --rpc-url http://127.0.0.1:8545 "${FORGE_SIGN[@]}" --broadcast >/tmp/cliente-ensaio.log 2>&1
ENSAIO=$?
set -e
rm -rf deployments/user broadcast cache
kill $ANVIL 2>/dev/null || true
trap - EXIT
[ $ENSAIO -eq 0 ] || { tail -25 /tmp/cliente-ensaio.log; morre "o ensaio falhou — nada foi gasto"; }
verde "  ensaio completou · artefatos do fork removidos"

# ------------------------------------------------------------------ 5 · decisao ---------------
azul "4 · O onboarding roda na Polygon de verdade agora"
amarelo "  Cria um cofre real em $COFRE e deposita $(cast --to-unit "$DEPOSITO" mwei) USDC nele."
amarelo "  O dinheiro fica seu: withdraw esta disponivel a qualquer momento, sem depender do servico."
printf '\n  Digite CLIENTE para seguir: '
read -r OK
[ "$OK" = "CLIENTE" ] || { echo "  abortado, nada foi gasto"; exit 0; }

forge script script/user/UserFlow.s.sol --tc UserFlow --rpc-url "$RPC" "${FORGE_SIGN[@]}" --broadcast --slow

# ------------------------------------------------------------------ 6 · conferir --------------
azul "5 · Conferindo o cofre na chain"
FALHOU=0
confere() {
    local esperado=$1 rotulo=$2; shift 2
    local got; got=$(cast call "$@" --rpc-url "$RPC")
    if [ "$got" = "$esperado" ]; then verde "  ok    $rotulo = $got"
    else printf '\033[0;31m  FALHA %s = %s (esperado %s)\033[0m\n' "$rotulo" "$got" "$esperado"; FALHOU=1; fi
}

confere "$CLIENTE"  "o dono e o cliente"       "$COFRE" 'owner()(address)'
confere "$REG"      "le o registry do protocolo" "$COFRE" 'REGISTRY()(address)'
confere "18"        "decimais do ativo"        "$COFRE" 'assetDecimals(address)(uint8)' "$ASSET"
confere "6"         "decimais da base"         "$COFRE" 'baseCurrencyDecimals(address)(uint8)' "$BASE"
confere "$DEPOSITO" "USDC dentro do cofre"     "$BASE"  'balanceOf(address)(uint256)' "$COFRE"

ESTRATEGIA=$(cast call "$COFRE" 'strategy()(address)' --rpc-url "$RPC")
verde "  ok    estrategia plugada = $ESTRATEGIA"
PISO=$(cast call "$ESTRATEGIA" 'MIN_OUT_PER_TICKET()(uint256)' --rpc-url "$RPC" | awk '{print $1}')
if [ "$PISO" = "$MIN_OUT_PER_TICKET" ]; then verde "  ok    piso de compra = $PISO (nao zero)"
else printf '\033[0;31m  FALHA piso = %s\033[0m\n' "$PISO"; FALHOU=1; fi

[ $FALHOU -eq 0 ] || morre "o cofre nasceu torto"

azul "O fluxo da pasta funciona em mainnet."
echo "  cofre    $COFRE"
echo "  dono     $CLIENTE"
echo "  saldo    $(cast --to-unit "$DEPOSITO" mwei) USDC"
echo
echo "  Para tirar o dinheiro a qualquer momento:"
echo "    cast send $COFRE 'withdraw(address,uint256,address)' $BASE $DEPOSITO $CLIENTE --rpc-url polygon --account $CLIENTE_ALIAS"
