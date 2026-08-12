#!/usr/bin/env bash
# Conferencia pos-deploy · Polygon PoS (chain 137)
# ================================================
#
# Roda DEPOIS do deploy e falha alto quando o que esta na chain diverge do que a
# casa afirma publicamente. Existe por causa de um caso concreto:
#
#   polygon.ps1 linha 89 liga o --verify SO se ETHERSCAN_API_KEY estiver
#   preenchida; sem ela, imprime um aviso amarelo "verificar depois" e segue. O
#   deploy de 2026-08-11 rodou assim. O aviso apareceu, ninguem foi cobrado, os
#   tres contratos ficaram sem fonte publicada, e o site continuou dizendo
#   "verified on the block explorer" durante esse tempo todo.
#
# Aviso de que ninguem e cobrado nao e guarda. Isto e a guarda: sai != 0.
#
#     bash deploy/conferir-deploy.sh
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
cd "$RAIZ"

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$*"; }

FALHAS=0
falhou() { vermelho "  FALHA · $*"; FALHAS=$((FALHAS+1)); }
passou() { verde    "  ok    · $*"; }

# ------------------------------------------------------- 0 · achar o Foundry
# `forge` e `cast` estao instalados nesta maquina e NAO estao no PATH de nenhum
# shell. Chamar o binario puro falha com "command not found" — foi assim que uma
# conferencia inteira quase saiu com veredito de um comando que nunca rodou.
# Procura no PATH primeiro, depois nos lugares onde o foundryup instala.
achar() {
  local nome="$1" p
  if command -v "$nome" >/dev/null 2>&1; then command -v "$nome"; return 0; fi
  # ${USER:-} e nao $USER: com `set -u` uma variavel nao-definida aborta a
  # expansao da lista INTEIRA antes de testar qualquer caminho — o binario
  # existe, o script jura que nao, e o motivo nao aparece.
  for p in "$HOME/.foundry/bin/$nome" "$HOME/.foundry/bin/$nome.exe" \
           "/c/Users/${USER:-${USERNAME:-x}}/.foundry/bin/$nome.exe" \
           "/opt/foundry/bin/$nome"; do
    [ -x "$p" ] && { printf '%s' "$p"; return 0; }
  done
  return 1
}

echo "=== 0 · ferramental ==="
CAST="$(achar cast)" || { vermelho "cast nao encontrado nem no PATH nem em ~/.foundry/bin"; exit 2; }
passou "cast em $CAST"

[ -f "$AQUI/mainnet.env" ] || { vermelho "falta $AQUI/mainnet.env"; exit 2; }
set -a; . "$AQUI/mainnet.env"; set +a
: "${CHAIN_RPC:?CHAIN_RPC vazio}"

REG=0x1Adab61ef019d853BBcFaf65E929961b11897856
EXE=0xEdB5Aa01fd055B3755439cE41B92b575eea1d273
GAS=0xFF0Dc2fC461E28bbAC7964496535989311e93f56
SAFE=0x73e344Be290c0D53Badbe528e45877296F6dAf6E
ORFAOS="0x43DB0d57441Ee1F791989ED0EeC2C12eC76A2196 0x41CbCd2C0C3564fBFA130C614d2c1F58dE8113D1 0x9ABa958EaC3649925378EfC7a7DBc573116E5d31"

# --------------------------------------------------- 1 · os tres tem codigo
echo
echo "=== 1 · os tres contratos existem na chain ==="
for par in "ParameterRegistry:$REG" "TriviuExecutor:$EXE" "GasTank:$GAS"; do
  N="${par%%:*}"; A="${par##*:}"
  C=$("$CAST" code "$A" --rpc-url "$CHAIN_RPC" 2>/dev/null || echo 0x)
  B=$(( (${#C} - 2) / 2 ))
  if [ "$B" -gt 0 ]; then passou "$N tem $B bytes"; else falhou "$N SEM CODIGO em $A"; fi
done

# ------------------------------------- 2 · o Executor aponta para o Registry
# `registry` e immutable no Executor: se isto divergir, o binario implantado nao
# e o que este repositorio compila, e nenhuma outra conferencia vale.
echo
echo "=== 2 · o Executor esta preso ao Registry certo ==="
APONTA=$("$CAST" call "$EXE" 'registry()(address)' --rpc-url "$CHAIN_RPC" 2>/dev/null)
if [ "$(printf '%s' "$APONTA" | tr 'A-Z' 'a-z')" = "$(printf '%s' "$REG" | tr 'A-Z' 'a-z')" ]; then
  passou "Executor.registry() == ParameterRegistry vivo"
else
  falhou "Executor.registry() = $APONTA · esperado $REG"
fi

# ----------------------------------------------------------- 3 · a custodia
echo
echo "=== 3 · custodia ==="
OWNER=$("$CAST" call "$REG" 'owner()(address)' --rpc-url "$CHAIN_RPC" 2>/dev/null)
PEND=$("$CAST" call "$REG" 'pendingOwner()(address)' --rpc-url "$CHAIN_RPC" 2>/dev/null)
baixo() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }
if [ "$(baixo "$OWNER")" = "$(baixo "$SAFE")" ] && [ "$(baixo "$PEND")" = "0x0000000000000000000000000000000000000000" ]; then
  passou "posse concluida no Safe"
else
  amarelo "  PENDENTE · owner=$OWNER pendingOwner=$PEND"
  amarelo "            o acceptOwner() ainda nao foi assinado pelo Safe."
  amarelo "            Isto NAO conta como falha: e acao do fundador, nao da matilha."
fi

# --------------------------------- 4 · a fonte esta publicada no explorador
# O site afirma "verified on the block explorer". Esta e a conferencia dessa
# frase. O marcador foi calibrado contra um controle: a pagina de um contrato
# verificado (USDC na Polygon) NAO traz "Are you the contract creator"; a de um
# nao-verificado traz. Sem o controle, a ausencia de um texto nao prova nada.
echo
echo "=== 4 · fonte publicada no Polygonscan ==="
marcador() { curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" "https://polygonscan.com/address/$1" 2>/dev/null | grep -ci 'Are you the contract creator'; }
CTRL=$(marcador 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359)
if [ "$CTRL" != "0" ]; then
  amarelo "  controle inconclusivo (USDC deu $CTRL) · o marcador mudou · conferencia 4 PULADA"
  amarelo "  NAO trate isto como aprovacao: ninguem mediu."
else
  for par in "ParameterRegistry:$REG" "TriviuExecutor:$EXE" "GasTank:$GAS"; do
    N="${par%%:*}"; A="${par##*:}"
    # Falha, e falha pelo motivo certo. A pagina de seguranca ja NAO afirma que a
    # fonte esta publicada — foi corrigida. O que segue pendente e o compromisso:
    # o runbook e o laudo D2 exigem a verificacao, e ela nao foi feita. Guarda que
    # falha pelo motivo errado ensina a ignorar a guarda.
    if [ "$(marcador "$A")" = "0" ]; then passou "$N com fonte publicada"
    else falhou "$N SEM fonte publicada · pendencia do runbook e do laudo D2, ainda em aberto.
          Precisa de ETHERSCAN_API_KEY em mainnet.env (hoje: vazia) e entao:
          forge verify-contract $A src/<Contrato>.sol:<Contrato> --chain 137
          Quando passar, devolva a frase ao site/learn/safety (ela foi retirada por ser falsa)."; fi
  done
fi

# -------------------------------- 5 · nenhum orfao citado em arquivo do produto
echo
echo "=== 5 · nenhum orfao referenciado no produto ==="
for O in $ORFAOS; do
  H=$(grep -ril "$O" --include='*.html' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.md' \
      "$RAIZ/.." 2>/dev/null | grep -viE 'node_modules|/deploy/|broadcast|conferir-deploy' | head -3)
  if [ -z "$H" ]; then passou "orfao ${O:0:12}… nao citado"
  else falhou "orfao ${O:0:12}… citado em: $(echo "$H" | tr '\n' ' ')"; fi
done

echo
if [ "$FALHAS" -eq 0 ]; then verde "=== conferencia limpa ==="; exit 0
else vermelho "=== $FALHAS conferencia(s) falharam ==="; exit 1; fi
