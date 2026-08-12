#!/usr/bin/env bash
# Gate 2 · tesouraria e aliquota no ParameterRegistry · Polygon (137)
# ==================================================================
#
#     bash deploy/configurar-taxa.sh
#
# Faz as DUAS chamadas do Safe pelo terminal, pelo mesmo caminho que o
# acceptOwner: threshold 1 com dono unico aceita assinatura PRE-VALIDADA
# (r = dono, s = 0, v = 1), entao nao ha assinatura off-chain a coletar e a
# interface web nao faz nada aqui que isto nao faca.
#
# Existe porque o Transaction Builder monta a chamada pela ABI por padrao e
# reaproveita o formulario anterior — foi assim que um `acceptOwner` ja
# executado voltou a aparecer no lugar destas duas.
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(cd "$AQUI/.." && pwd)"
vermelho(){ printf '\033[31m%s\033[0m\n' "$*"; }
verde(){ printf '\033[32m%s\033[0m\n' "$*"; }
amarelo(){ printf '\033[33m%s\033[0m\n' "$*"; }

achar(){ local n="$1" p
  command -v "$n" >/dev/null 2>&1 && { command -v "$n"; return 0; }
  for p in "$HOME/.foundry/bin/$n" "$HOME/.foundry/bin/$n.exe" \
           "/c/Users/${USER:-${USERNAME:-x}}/.foundry/bin/$n.exe"; do
    [ -x "$p" ] && { printf '%s' "$p"; return 0; }
  done; return 1; }
CAST="$(achar cast)" || { vermelho "cast nao encontrado"; exit 2; }

set -a; . "$AQUI/mainnet.env"; set +a
: "${CHAIN_RPC:?CHAIN_RPC vazio}"

SAFE=0x73e344Be290c0D53Badbe528e45877296F6dAf6E
REG=0x1Adab61ef019d853BBcFaf65E929961b11897856
DONO=0xb5Fb0CDaab5784cBE05CcB9D843DaFe4663883C5
Z=0x0000000000000000000000000000000000000000
FEE_BPS="${FEE_BPS:-3000}"
PR="${PR_URL:-https://github.com/Triviu-Protocol/Triviu-Protocol/blob/main/decisions/0003-success-fee.md}"
A="execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)"
SIG="0x000000000000000000000000${DONO:2}$(printf '0%.0s' $(seq 64))01"

baixo(){ printf '%s' "$1" | tr 'A-Z' 'a-z'; }
echo "=== antes ==="
echo "  treasury $("$CAST" call $REG 'treasury()(address)' --rpc-url "$CHAIN_RPC")"
echo "  feeBps   $("$CAST" call $REG 'feeBps()(uint16)' --rpc-url "$CHAIN_RPC")"

D1=$("$CAST" calldata 'setTreasury(address,string)' $SAFE "$PR")
D2=$("$CAST" calldata "setFeeBps(uint16,string)" "$FEE_BPS" "$PR")

# Simular antes de gastar. Uma transacao que reverte custa gas do mesmo jeito.
echo
echo "=== simulacao ==="
for par in "setTreasury:$D1" "setFeeBps($FEE_BPS):$D2"; do
  N="${par%%:*}"; D="${par##*:}"
  R=$("$CAST" call $SAFE "$A(bool)" $REG 0 "$D" 0 0 0 0 $Z $Z "$SIG" --from $DONO --rpc-url "$CHAIN_RPC" 2>&1 | head -1)
  [ "$R" = "true" ] || { vermelho "  $N devolveu '$R' · abortado antes de gastar"; exit 1; }
  verde "  $N ok"
done

echo
amarelo "Duas transacoes REAIS na Polygon, a partir do Safe."
echo "  tesouraria -> $SAFE"
echo "  aliquota   -> $FEE_BPS bps"
printf '  Confirma? (digite: aplicar) '
read -r C
[ "$C" = "aplicar" ] || { vermelho "abortado"; exit 1; }

for par in "setTreasury:$D1" "setFeeBps:$D2"; do
  N="${par%%:*}"; D="${par##*:}"
  echo; echo "--- $N"
  "$CAST" send $SAFE "$A" $REG 0 "$D" 0 0 0 0 $Z $Z "$SIG" \
    --interactive --rpc-url "$CHAIN_RPC" || { vermelho "  $N falhou"; exit 1; }
done

# Ler o ESTADO, nunca o recibo: o Safe emite ExecutionFailure em vez de
# reverter quando a chamada interna falha, entao "sucesso" no recibo pode
# conviver com nada alterado.
echo
echo "=== depois (lido da chain) ==="
T=$("$CAST" call $REG 'treasury()(address)' --rpc-url "$CHAIN_RPC")
F=$("$CAST" call $REG 'feeBps()(uint16)' --rpc-url "$CHAIN_RPC")
echo "  treasury $T"
echo "  feeBps   $F"
if [ "$(baixo "$T")" = "$(baixo "$SAFE")" ] && [ "$F" = "$FEE_BPS" ]; then
  verde "=== gate 2 fechado · o deploy do LPVault ja passa ==="; exit 0
fi
vermelho "=== as transacoes entraram e o estado NAO mudou ==="
vermelho "  Procure ExecutionFailure nos hashes acima antes de repetir."
exit 1
