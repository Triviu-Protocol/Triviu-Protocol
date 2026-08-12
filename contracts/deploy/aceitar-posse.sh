#!/usr/bin/env bash
# Perna 2 da posse · o Safe aceita o ParameterRegistry · Polygon PoS (137)
# ========================================================================
#
#     bash deploy/aceitar-posse.sh
#
# POR QUE ISTO EXISTE EM BASH, e nao so no app.safe.global: este Safe tem
# threshold 1 e um unico dono, que e a carteira do deploy. Nessa configuracao o
# Safe aceita a chamada direto do dono com uma assinatura PRE-VALIDADA — nao ha
# assinatura off-chain a coletar, entao nao ha nada que a interface web faca aqui
# que o terminal nao faca.
#
# A assinatura pre-validada e 65 bytes: r = o endereco do dono em 32 bytes,
# s = 32 bytes zero, v = 1. Com v = 1 o Safe nao recupera chave por ECDSA: ele
# exige que msg.sender SEJA o dono declarado em r. Por isso ela nao vale para
# mais ninguem — conferido: de outro endereco a mesma chamada reverte GS025.
#
# A chave privada NAO passa por argumento nem por variavel: o forge le o keystore
# cifrado e pede a senha na hora.
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(cd "$AQUI/.." && pwd)"

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$*"; }

achar() {
  local nome="$1" p
  command -v "$nome" >/dev/null 2>&1 && { command -v "$nome"; return 0; }
  for p in "$HOME/.foundry/bin/$nome" "$HOME/.foundry/bin/$nome.exe" \
           "/c/Users/${USER:-${USERNAME:-x}}/.foundry/bin/$nome.exe" "/opt/foundry/bin/$nome"; do
    [ -x "$p" ] && { printf '%s' "$p"; return 0; }
  done
  return 1
}
CAST="$(achar cast)" || { vermelho "cast nao encontrado nem no PATH nem em ~/.foundry/bin"; exit 2; }

[ -f "$AQUI/mainnet.env" ] || { vermelho "falta $AQUI/mainnet.env"; exit 2; }
set -a; . "$AQUI/mainnet.env"; set +a
: "${CHAIN_RPC:?CHAIN_RPC vazio}"
CONTA="${CONTA_DEPLOY:-triviu-deploy}"

SAFE=0x73e344Be290c0D53Badbe528e45877296F6dAf6E
REG=0x1Adab61ef019d853BBcFaf65E929961b11897856
DONO=0xb5Fb0CDaab5784cBE05CcB9D843DaFe4663883C5
Z=0x0000000000000000000000000000000000000000
ACEITAR=0xebbc4965   # acceptOwner()
ASSIN="execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)"
SIG="0x000000000000000000000000${DONO:2}$(printf '0%.0s' $(seq 64))01"

echo "=== antes ==="
ANTES=$("$CAST" call $REG 'owner()(address)' --rpc-url "$CHAIN_RPC")
PEND=$("$CAST" call $REG 'pendingOwner()(address)' --rpc-url "$CHAIN_RPC")
echo "  owner        $ANTES"
echo "  pendingOwner $PEND"
baixo(){ printf '%s' "$1" | tr 'A-Z' 'a-z'; }
if [ "$(baixo "$ANTES")" = "$(baixo "$SAFE")" ]; then
  verde "  a posse JA esta no Safe. Nada a fazer."; exit 0
fi
if [ "$(baixo "$PEND")" != "$(baixo "$SAFE")" ]; then
  vermelho "  pendingOwner nao e o Safe. Este script nao se aplica a este estado."; exit 1
fi

# ---------------------------------------------------- simular antes de gastar
# Uma transacao que reverte on-chain custa gas do mesmo jeito. Isto pergunta
# primeiro.
echo
echo "=== simulacao (nao gasta nada) ==="
OK=$("$CAST" call $SAFE "$ASSIN(bool)" $REG 0 $ACEITAR 0 0 0 0 $Z $Z "$SIG" --from $DONO --rpc-url "$CHAIN_RPC" 2>&1 | head -1)
if [ "$OK" != "true" ]; then
  vermelho "  a simulacao NAO devolveu true: $OK"
  vermelho "  abortado antes de gastar gas."; exit 1
fi
verde "  execTransaction devolve true"
GAS=$("$CAST" estimate $SAFE "$ASSIN" $REG 0 $ACEITAR 0 0 0 0 $Z $Z "$SIG" --from $DONO --rpc-url "$CHAIN_RPC" 2>/dev/null || echo '?')
verde "  gas estimado $GAS"

echo
amarelo "Vai enviar uma transacao REAL na Polygon mainnet."
echo "  do Safe  $SAFE"
echo "  para     $REG"
echo "  chamando acceptOwner()"
printf '  Confirma? (digite: aceitar) '
read -r C
[ "$C" = "aceitar" ] || { vermelho "abortado"; exit 1; }

# Como a carteira assina, decidido pelo que EXISTE nesta maquina e nao pelo que
# o runbook presume. O deploy correu pelo polygon.ps1, que usa --interactive
# ("usa e esquece") e portanto NAO criou keystore nenhum: `cast wallet list` vem
# vazio. Preferir --account aqui produziria um erro no ultimo passo, depois de o
# usuario ja ter confirmado.
if "$CAST" wallet list 2>/dev/null | grep -qx "$CONTA"; then
  amarelo "  keystore '$CONTA' encontrado · vai pedir a SENHA dele"
  MODO=(--account "$CONTA")
else
  amarelo "  nao ha keystore nesta maquina · vai pedir a CHAVE PRIVADA no prompt"
  amarelo "  (a mesma que voce colou no deploy · nao fica gravada, nao entra no historico)"
  MODO=(--interactive)
fi

"$CAST" send $SAFE "$ASSIN" $REG 0 $ACEITAR 0 0 0 0 $Z $Z "$SIG" \
  "${MODO[@]}" --rpc-url "$CHAIN_RPC" || { vermelho "envio falhou"; exit 1; }

# ------------------------------------------- conferir na chain, nao no recibo
# O recibo diz que a transacao entrou. So a leitura de estado diz que ela fez o
# que devia: um execTransaction pode entrar com sucesso e a chamada interna
# falhar, porque o Safe emite ExecutionFailure em vez de reverter.
echo
echo "=== depois (lido da chain, nao do recibo) ==="
DEP=$("$CAST" call $REG 'owner()(address)' --rpc-url "$CHAIN_RPC")
DPEND=$("$CAST" call $REG 'pendingOwner()(address)' --rpc-url "$CHAIN_RPC")
echo "  owner        $DEP"
echo "  pendingOwner $DPEND"
if [ "$(baixo "$DEP")" = "$(baixo "$SAFE")" ] && [ "$(baixo "$DPEND")" = "$(baixo "$Z")" ]; then
  verde "=== posse concluida no Safe ==="
  echo
  bash "$AQUI/conferir-deploy.sh"
  exit $?
fi
vermelho "=== a transacao entrou e a posse NAO mudou ==="
vermelho "  O Safe emite ExecutionFailure em vez de reverter quando a chamada"
vermelho "  interna falha. Procure esse evento no hash acima antes de repetir."
exit 1
