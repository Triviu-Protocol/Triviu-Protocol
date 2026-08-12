#!/usr/bin/env bash
# Whitelist dos pares de LP · ParameterRegistry · Polygon (137)
# =============================================================
#
#     bash deploy/liberar-pares-lp.sh
#
# Este e o ultimo passo antes de um usuario conseguir abrir posicao. Enquanto a
# whitelist estiver vazia, `TriviuLPVault.abrir` reverte em TokenNaoPermitido
# para qualquer par — o contrato esta vivo e inutilizavel de proposito.
#
# Os 8 tokens abaixo NAO foram escolhidos aqui: sao exatamente os que o painel
# de LP mede na Polygon (triviu-lp-panel.html, linhas 218-225). Liberar um token
# que o painel nao mede seria abrir uma porta para a qual ninguem tem numero.
#
# Nenhum deles e fee-on-transfer nem rebasing — o achado M-2 do laudo D2 exige
# essa exclusao, e ela e verificada por leitura, nao presumida.
#
# Cada chamada grava o prUrl on-chain: parametro sem PR publica nao existe por
# construcao (o modificador withPr reverte com EmptyPrUrl).
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
PR="${PR_URL:-https://github.com/Triviu-Protocol/Triviu-Protocol/blob/main/decisions/0003-success-fee.md}"
A="execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)"
SIG="0x000000000000000000000000${DONO:2}$(printf '0%.0s' $(seq 64))01"

# Os 8 da Polygon, na ordem em que o painel os lista.
TOKENS="
USDC.e:0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
USDC:0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
USDT:0xc2132D05D31c914a87C6611C10748AEb04B58e8F
DAI:0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063
WETH:0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619
WBTC:0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6
WPOL:0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270
LINK:0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39
"

echo "=== estado atual da whitelist ==="
FALTAM=""
for par in $TOKENS; do
  N="${par%%:*}"; T="${par##*:}"
  L=$("$CAST" call $REG 'isAllowedToken(address)(bool)' $T --rpc-url "$CHAIN_RPC" 2>/dev/null)
  if [ "$L" = "true" ]; then verde "  $N ja liberado"; else amarelo "  $N nao liberado"; FALTAM="$FALTAM $par"; fi
done
[ -z "$FALTAM" ] && { verde "=== os 8 ja estao liberados · nada a fazer ==="; exit 0; }

# Simular TODAS antes de enviar QUALQUER uma. Enviar metade e pior que nao
# enviar nada: deixa a whitelist num estado que ninguem projetou.
echo
echo "=== simulacao (nao envia nada) ==="
for par in $FALTAM; do
  N="${par%%:*}"; T="${par##*:}"
  D=$("$CAST" calldata 'setToken(address,bool,string)' $T true "$PR")
  R=$("$CAST" call $SAFE "$A(bool)" $REG 0 "$D" 0 0 0 0 $Z $Z "$SIG" --from $DONO --rpc-url "$CHAIN_RPC" 2>&1 | head -1)
  [ "$R" = "true" ] || { vermelho "  $N devolveu '$R' · ABORTADO antes de enviar qualquer uma"; exit 1; }
  verde "  $N ok"
done

echo
amarelo "Vai liberar $(echo $FALTAM | wc -w) token(s) na Polygon mainnet."
amarelo "Depois disto um usuario CONSEGUE abrir posicao de LP."
printf '  Confirma? (digite: liberar) '
read -r C
[ "$C" = "liberar" ] || { vermelho "abortado"; exit 1; }

for par in $FALTAM; do
  N="${par%%:*}"; T="${par##*:}"
  echo; echo "--- $N  $T"
  D=$("$CAST" calldata 'setToken(address,bool,string)' $T true "$PR")
  "$CAST" send $SAFE "$A" $REG 0 "$D" 0 0 0 0 $Z $Z "$SIG" \
    --interactive --rpc-url "$CHAIN_RPC" || { vermelho "  $N falhou"; exit 1; }
done

# Ler o ESTADO, nunca o recibo: o Safe emite ExecutionFailure em vez de reverter.
echo
echo "=== depois (lido da chain) ==="
FALHOU=0
for par in $TOKENS; do
  N="${par%%:*}"; T="${par##*:}"
  L=$("$CAST" call $REG 'isAllowedToken(address)(bool)' $T --rpc-url "$CHAIN_RPC" 2>/dev/null)
  if [ "$L" = "true" ]; then verde "  $N liberado"; else vermelho "  $N NAO liberado"; FALHOU=1; fi
done
[ "$FALHOU" -eq 0 ] && { echo; verde "=== whitelist aberta · o LP esta operavel ==="; exit 0; }
echo; vermelho "=== algum token nao pegou · procure ExecutionFailure nos hashes acima ==="
exit 1
