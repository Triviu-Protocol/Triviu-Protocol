#!/usr/bin/env bash
#
# ONBOARDING DE USUARIO · Triviu · Polygon PoS (137)
#
# Roda os nove passos do fluxo contra os contratos VIVOS, como um usuario novo faria. Nao e o
# dono do protocolo criando um cofre para si: e uma carteira virgem percorrendo o caminho que a
# pasta entrega. Endereco novo nao tem estado anterior, entao nada passa por acidente.
#
#   bash script/usuario.sh
#
# Para usar uma carteira que voce ja tem, em vez da nova (o forge pede a chave na hora):
#
#   TRIVIU_USUARIO=0x1234567890abcdef1234567890abcdef12345678 bash script/usuario.sh
#
# O exemplo acima tem 40 hex de proposito. A versao anterior desta linha dizia
# `0xSeuEndereco`, e em 2026-08-22 ela foi colada literal duas vezes seguidas —
# um exemplo que PARECE comando e um exemplo que E comando sao a mesma coisa
# para quem copia. A validacao logo abaixo pega, mas o exemplo nao deveria ter
# convidado o erro.
#
set -euo pipefail
cd "$(dirname "$0")/.."

# ------------------------------------------------------------------ parametros do teste ------
ASSET=0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270        # WMATIC
TICKET=100000                                            # 0,10 da base por compra
DEPOSITO=1000000                                         # 1,00 da base
MIN_OUT_PER_TICKET=890000000000000000                    # 0,89 WMATIC por ticket

# A BASE NAO E ESCOLHIDA AQUI, E ISSO FOI APRENDIDO CARO EM 2026-08-22.
#
# Ela morava nesta linha como constante, e o Solidity NUNCA a leu daqui:
# UserFlow.s.sol:84, 03_SetBaseCurrency:31, 04_SetStrategy:75, 08_Deposit:53 e
# 09_Withdraw:54 fazem todos
#
#     address base = Deployments.read(block.chainid, "baseCurrency");
#
# ou seja, leem deployments/137.json. As duas coisas coincidiam por acaso.
# Quando a constante daqui foi trocada para USDT, o shell passou a conferir o
# saldo de um token e o Solidity a gastar outro: o passo 2 aprovou, disse
# "USDT0 na carteira 1,678895 (precisa de 1)", e o deposito reverteu com
# "ERC20: transfer amount exceeds balance" sobre USDC, do qual a carteira tinha
# zero. O ensaio contra o fork pegou antes de gastar; sem ele, a transacao real
# teria criado o cofre, configurado tudo e revertido no deposito, com gas pago.
#
# Entao a duplicata SAIU. A base vem do mesmo lugar que o Solidity le, e nao ha
# como as duas divergirem de novo — nao ha duas.
#
# Trocar a moeda-base de verdade NAO e editar este arquivo nem o 137.json (que e
# o registro do que foi implantado, e falsifica-lo apaga a unica prova do que o
# genesis fez). E chamar setBaseCurrency no ProtocolRegistry, pela Safe, 2 de 3.
#
# O PISO, cotado contra o mercado e nao herdado:
#   getAmountsOut(0,10 base -> WMATIC) na QuickSwap V2 = 0,946224 WMATIC
#   par 0x604229c960e5CACF2aaEAc8Be68Ac07BA9dF81c3 · reservas 554.084 WMATIC / 58.381
#   0,89 e ~5,9% de tolerancia, a mesma intencao que a versao anterior declarava.
# NAO deixe isto em zero: o construtor recusa, e a razao esta no README.

COOLDOWN=3600
MAX_VALIDITY=900
MIN_RATIO_BPS=0     # o piso que vale e o da estrategia, acima. Ver README, secao Trust model.
QUANTUM=0
VAULT_INDEX=0

RPC_PUBLICO=https://polygon-bor-rpc.publicnode.com
USUARIO_ALIAS=triviu-usuario
CACHE=.genesis-enderecos
KEYSTORES="${HOME}/.foundry/keystores"
GAS_FLUXO=1400000

# A porta do ensaio, num lugar so. Ela estava escrita a mao em tres pontos, e
# um valor repetido e um valor que um dia diverge. Se 8545 estiver ocupada na
# sua maquina, troque aqui: PORTA_ENSAIO=8546 bash script/usuario.sh
PORTA_ENSAIO="${PORTA_ENSAIO:-8545}"
ENSAIO_RPC="http://127.0.0.1:${PORTA_ENSAIO}"

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
# A base sai DAQUI, do mesmo arquivo que o Solidity le. Era constante no topo, e
# as duas divergiram silenciosamente uma vez. Uma fonte so nao diverge.
BASE=$(grep -o '"baseCurrency"[[:space:]]*:[[:space:]]*"0x[a-fA-F0-9]\{40\}"' deployments/137.json | grep -o '0x[a-fA-F0-9]\{40\}')
[ -n "$BASE" ] || morre "deployments/137.json nao declara baseCurrency — sem ela o fluxo nao sabe o que depositar"

azul "0 · Contra o que este teste roda"
verde "  factory  $FACTORY"
verde "  registry $REG"
verde "  bloco    $(cast block-number --rpc-url "$RPC")"

# O simbolo sai da CHAIN, nunca de literal. Ate 2026-08-22 seis mensagens deste
# script diziam "USDC" escrito a mao enquanto $BASE era uma variavel: trocar a
# base deixava a tela mentindo em seis lugares de uma vez, e nenhum deles quebra.
SIMBOLO=$(cast call "$BASE" 'symbol()(string)' --rpc-url "$RPC" 2>/dev/null | tr -d '"' | tr -d '\r')
[ -n "$SIMBOLO" ] || SIMBOLO="$BASE"
verde "  base     $BASE  ($SIMBOLO)"

# A CURADORIA, LIDA NA CHAIN E NAO SUPOSTA. Um comentario no topo do arquivo nao
# alcanca quem roda: quem roda le o terminal. Entao a consequencia aparece aqui,
# antes de qualquer gasto, e vem de eth_call e nao de memoria.
CURADA=$(cast call "$REG" 'isBaseCurrency(address)(bool)' "$BASE" --rpc-url "$RPC" 2>/dev/null)
if [ "$CURADA" = "true" ]; then
    verde "  curada   sim - o cofre nascera capaz de abrir posicao"
else
    amarelo ""
    amarelo "  ATENCAO: $SIMBOLO NAO e moeda-base curada no ProtocolRegistry."
    amarelo "  isBaseCurrency($BASE) = $CURADA"
    amarelo ""
    amarelo "  Os nove passos abaixo VAO COMPLETAR: o cofre nasce, aceita $SIMBOLO,"
    amarelo "  deposita e saca. Nenhum deles negocia, entao nada aqui reverte."
    amarelo "  Mas a PRIMEIRA COMPRA revertera com BaseNotCurated, e continuara"
    amarelo "  revertendo ate a Safe (2 de 3) chamar setBaseCurrency($SIMBOLO, true)."
    amarelo ""
    amarelo "  Isto prova que o fluxo funciona em mainnet, e entrega um cofre que"
    amarelo "  ainda nao pode abrir posicao. Se quiser o cofre ja capaz, use uma"
    amarelo "  base curada e rode de novo."
fi

# ------------------------------------------------------------------ 1 · o usuario -------------
azul "1 · A carteira do usuario"
so_endereco() { grep -o '0x[a-fA-F0-9]\{40\}' | head -1; }

if [ -n "${TRIVIU_USUARIO:-}" ]; then
    USUARIO="$TRIVIU_USUARIO"

    # O script conferia a porta, a chain e a altura do bloco, e NAO conferia o
    # endereco que a pessoa entrega. Medido em 2026-08-22: TRIVIU_USUARIO=0xSeuEndereco
    # passou por aqui, foi impresso como "sua carteira", e so quebrou tres linhas
    # adiante num erro cru do cast ("invalid string length") que nao diz o que
    # fazer.
    #
    # E o caso barulhento e o menos grave. Quarenta hex VALIDOS da carteira
    # errada nao quebram nada: o script vai ate o fim e cria um cofre cujo dono
    # imutavel e o endereco errado. Nao ha desfazer isso.
    if ! printf '%s' "$USUARIO" | grep -Eq '^0x[0-9a-fA-F]{40}$'; then
        morre "TRIVIU_USUARIO nao e um endereco: '$USUARIO'
       Precisa ser 0x seguido de 40 digitos hexadecimais.
       Exemplo do formato:  TRIVIU_USUARIO=0x1234567890abcdef1234567890abcdef12345678"
    fi
    # Carteira de contrato (Safe, smart account) nao assina por `forge -i`.
    # Aceitar aqui daria uma falha confusa la na frente, no meio do fluxo.
    if [ "$(cast code "$USUARIO" --rpc-url "$RPC")" != "0x" ]; then
        morre "$USUARIO tem codigo: e um contrato, nao uma carteira que assina.
       A assinatura interativa (-i) precisa de uma chave. Para um Safe, o caminho
       e outro: propor a transacao na Safe, nao rodar este script."
    fi

    FORGE_SIGN=(-i)
    verde "  sua carteira: $USUARIO  ·  assinatura interativa, nada em disco"
elif cacheado=$(grep -o "^$USUARIO_ALIAS=0x[a-fA-F0-9]\{40\}$" "$CACHE" 2>/dev/null | cut -d= -f2 | head -1) && [ -n "$cacheado" ]; then
    USUARIO="$cacheado"
    FORGE_SIGN=(--account "$USUARIO_ALIAS")
    verde "  usuario: $USUARIO  (do cache, sem senha)"
else
    amarelo "  criando uma carteira NOVA para o usuario — escolha uma senha:"
    mkdir -p "$KEYSTORES"
    USUARIO=$(cast wallet new "$KEYSTORES" "$USUARIO_ALIAS" 2>&1 | so_endereco)
    [ -n "$USUARIO" ] || morre "nao consegui criar a carteira do usuario"
    # O cache nao terminava com quebra de linha e o append colava a entrada
    # nova no fim da anterior. Medido em 2026-08-22:
    #   triviu-operator=0xB3eE...82Cbtriviu-usuario=0xA7C1...7Cf9
    # Com isso o `grep -o "^triviu-usuario="` nunca casa, a carteira em cache
    # nunca e reaproveitada, e cada execucao cria uma carteira NOVA — deixando
    # o dinheiro na anterior, orfa e silenciosa. Guarda a quebra antes de somar.
    [ -s "$CACHE" ] && [ -n "$(tail -c1 "$CACHE")" ] && printf '\n' >> "$CACHE"
    printf '%s=%s\n' "$USUARIO_ALIAS" "$USUARIO" >> "$CACHE"
    FORGE_SIGN=(--account "$USUARIO_ALIAS")
    verde "  usuario: $USUARIO"
fi

COFRE=$(cast call "$FACTORY" 'vaultAddress(address,uint256)(address)' "$USUARIO" "$VAULT_INDEX" --rpc-url "$RPC")
verde "  o cofre dele nascera em $COFRE  (CREATE2, previsto antes de existir)"

# ------------------------------------------------------------------ 2 · fundos ----------------
azul "2 · O que a carteira precisa ter"
POL=$(cast balance "$USUARIO" --rpc-url "$RPC")
USD=$(cast call "$BASE" 'balanceOf(address)(uint256)' "$USUARIO" --rpc-url "$RPC" | awk '{print $1}')
GWEI=$(cast gas-price --rpc-url "$RPC")
CUSTO=$(cast --to-unit $((GAS_FLUXO * GWEI)) ether)
POL_TEM=$(cast --to-unit "$POL" ether)

printf '  gas do fluxo   %s a %s gwei -> %s POL\n' "$GAS_FLUXO" "$(cast --to-unit "$GWEI" gwei)" "$CUSTO"
printf '  POL na carteira  %s\n' "$POL_TEM"
printf '  %s na carteira %s  (precisa de %s)\n' "$SIMBOLO" "$(cast --to-unit "$USD" mwei)" "$(cast --to-unit "$DEPOSITO" mwei)"

FALTA=0
awk -v s="$POL_TEM" -v c="$CUSTO" 'BEGIN { exit !(s < c * 1.5) }' && { amarelo "  falta POL"; FALTA=1; }
[ "$USD" -ge "$DEPOSITO" ] || { amarelo "  falta $SIMBOLO"; FALTA=1; }

if [ "$FALTA" = "1" ]; then
    amarelo ""
    amarelo "  Mande para $USUARIO :"
    amarelo "    $(awk -v c="$CUSTO" 'BEGIN { printf "%.1f", c * 2 }') POL   e   $(cast --to-unit "$DEPOSITO" mwei) $SIMBOLO"
    amarelo "  Depois rode o mesmo comando: ele reaproveita a carteira e segue daqui."
    exit 0
fi

# ------------------------------------------------------------------ 3 · .env -----------------
# ESTE ARQUIVO NAO E SO SEU. Medido em 2026-08-22, antes de alguem rodar isto:
# contracts/.env ja existia e era o .env do GENESIS — GOVERNANCE, TREASURY,
# OPERATOR, BASE_TOKEN e FEE_BPS. O `cat > .env` abaixo apaga tudo e escreve
# parametros de usuario no lugar. Das dez chaves, so POLYGON_RPC_URL coincide:
# as outras cinco do genesis sumiriam.
#
# E nao daria para desfazer. O arquivo esta no .gitignore — `git checkout` nao
# tem o que restaurar — e regenerar rodando genesis.sh de novo seria pior que a
# perda, porque o genesis ja rodou na Polygon.
#
# Entao ele e devolvido. A copia sai antes da escrita e volta em QUALQUER saida:
# sucesso, erro, Ctrl-C ou `morre`. Backup que so existe no caminho feliz nao e
# backup — e a esperanca de nao precisar dele.
ENV_GUARDADO=""
restaura_env() {
    [ -n "$ENV_GUARDADO" ] && [ -f "$ENV_GUARDADO" ] || return 0
    cp "$ENV_GUARDADO" .env && rm -f "$ENV_GUARDADO"
    printf '\033[0;32m  .env do genesis devolvido\033[0m\n'
}
if [ -f .env ]; then
    ENV_GUARDADO="$(mktemp)"
    cp .env "$ENV_GUARDADO"
    verde "  .env existente guardado ($(grep -c . .env) linhas) — sera devolvido ao sair"
fi
trap restaura_env EXIT

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
VAULT=$COFRE
EOF

# ------------------------------------------------------------------ 4 · ensaio ----------------
azul "3 · Ensaio contra um fork da Polygon (nao gasta nada)"
BLOCO=$(cast block-number --rpc-url "$RPC")
ALVO=$((BLOCO - 30))

# ---- camada 1: a porta tem de estar LIVRE antes de subir qualquer coisa ------
# O ensaio e a unica coisa entre este script e gastar dinheiro de verdade na
# linha que vem depois. Se ja houver um no em $PORTA_ENSAIO, o anvil falha ao
# fazer bind, sai, e a conferencia seguinte responde — do NO ERRADO. O ensaio
# passaria contra outra chain e o script seguiria para a Polygon assim mesmo.
if cast chain-id --rpc-url "$ENSAIO_RPC" >/dev/null 2>&1; then
    morre "ja existe um no em $ENSAIO_RPC. O ensaio rodaria contra ele em vez de contra o fork,
       passaria por engano, e a proxima etapa gasta dinheiro de verdade.
       Feche o no, ou rode com outra porta:  PORTA_ENSAIO=8546 bash script/usuario.sh"
fi

anvil --fork-url "$RPC" --fork-block-number "$ALVO" --port "$PORTA_ENSAIO" --silent &
ANVIL=$!
# As duas limpezas no MESMO trap, de proposito: `trap` substitui, nao acumula.
# Registrar so o `kill` aqui apagaria o restaura_env instalado acima, e o backup
# do .env viraria teatro justamente no trecho onde o script mais pode morrer.
trap 'kill $ANVIL 2>/dev/null || true; restaura_env' EXIT

# ---- camada 2: esperar o no responder, sem numero magico ---------------------
# `sleep 12` era chute nos dois sentidos: falhava se o fork demorasse 13s e
# desperdicava 12s quando ele subia em 3.
PRONTO=0
for _ in $(seq 1 40); do
    if cast chain-id --rpc-url "$ENSAIO_RPC" >/dev/null 2>&1; then PRONTO=1; break; fi
    kill -0 "$ANVIL" 2>/dev/null || morre "o anvil morreu ao subir — rode de novo"
    sleep 1
done
[ "$PRONTO" = "1" ] || morre "o fork nao respondeu em 40s — rode de novo"

# ---- camada 3: e o no certo? -------------------------------------------------
# As camadas 1 e 2 provam que ha UM no e que ele responde. Nenhuma das duas
# prova que ele e um fork DESTA chain. Um no responder nao diz qual chain ele
# serve, e o ensaio so vale se rodar contra o estado real da Polygon.
CHAIN_ENSAIO=$(cast chain-id --rpc-url "$ENSAIO_RPC")
[ "$CHAIN_ENSAIO" = "137" ] || morre "o no em $ENSAIO_RPC diz chain $CHAIN_ENSAIO, e o ensaio precisa da 137"
ALTURA=$(cast block-number --rpc-url "$ENSAIO_RPC")
[ "$ALTURA" -ge "$ALVO" ] || morre "o no em $ENSAIO_RPC esta no bloco $ALTURA e o fork foi pedido em $ALVO — nao e o fork"
verde "  fork servindo chain $CHAIN_ENSAIO no bloco $ALTURA (pedido: $ALVO)"

set +e
POLYGON_RPC_URL="$ENSAIO_RPC" forge script script/user/UserFlow.s.sol --tc UserFlow \
    --rpc-url "$ENSAIO_RPC" "${FORGE_SIGN[@]}" --broadcast >/tmp/usuario-ensaio.log 2>&1
ENSAIO=$?
set -e
# A limpeza do ensaio apagava `broadcast` INTEIRO, e broadcast/ nao e do ensaio:
# ele guarda o registro de toda execucao com --broadcast que ja rodou nesta pasta,
# inclusive o do GENESIS. Medido em 2026-08-22, no primeiro ensaio real: sumiram
# contracts/broadcast/01_Deploy.s.sol/137/run-latest.json e o run-<timestamp>
# irmao, 128.859 bytes cada, com as 14 transacoes que criaram os seis contratos
# da V0 na Polygon no bloco 92478492 — a prova de o que foi implantado e como.
#
# Voltaram por `git checkout` porque estao rastreados. Se nao estivessem, teriam
# sumido de vez, e o ensaio que existe para NAO gastar nada teria destruido o
# registro do unico gasto que ja aconteceu.
#
# Agora a limpeza nomeia o que ela criou. O ensaio roda UserFlow.s.sol, entao e
# so isso que ela remove. `cache` continua saindo de proposito: o forge guarda
# estado de fork ali, e deixar cache de fork para tras faz a execucao real ler
# estado forjado.
# SEGUNDA VEZ A MESMA CLASSE, E A SEGUNDA FUI EU. Ao fechar TUBARAO-19 eu
# restringi esta limpeza de `broadcast` inteiro para `broadcast/UserFlow.s.sol`,
# e deixei `deployments/user` intacto no comando — a pasta VIZINHA, com o mesmo
# buraco. Ela guarda vaults.json, o registro de que o cofre
# 0xDd2d59866E20Ed354EaFaB49FdbD6cFce7243508 foi implantado na Polygon; o ensaio
# escreve ali tambem, e apagar tudo levaria o registro real junto.
#
# Consertar a instancia e nao a classe adia o defeito em vez de fecha-lo, e o
# adiamento durou uma unica execucao.
#
# Mecanismo: o mesmo do .env — guarda antes, devolve em qualquer saida. Nao
# tentar distinguir ensaio de real pelo conteudo: o ensaio roda contra um fork da
# 137 e escreve no MESMO caminho, entao nao ha o que distinguir.
USER_GUARDADO=""
restaura_user() {
    [ -n "$USER_GUARDADO" ] && [ -d "$USER_GUARDADO" ] || return 0
    rm -rf deployments/user
    cp -r "$USER_GUARDADO" deployments/user && rm -rf "$USER_GUARDADO"
    printf '\033[0;32m  deployments/user devolvido\033[0m\n'
}
if [ -d deployments/user ]; then
    USER_GUARDADO="$(mktemp -d)/user"
    cp -r deployments/user "$USER_GUARDADO"
    verde "  deployments/user guardado ($(find deployments/user -type f | wc -l) arquivo(s))"
fi

rm -rf deployments/user broadcast/UserFlow.s.sol cache
restaura_user
kill $ANVIL 2>/dev/null || true
# Volta ao trap de .env, e NAO limpa o trap: o script ainda pode morrer nas
# etapas seguintes (a real, a que gasta), e o .env do genesis tem de voltar
# tambem quando isso acontece.
trap restaura_env EXIT
[ $ENSAIO -eq 0 ] || { tail -25 /tmp/usuario-ensaio.log; morre "o ensaio falhou — nada foi gasto"; }
verde "  ensaio completou · artefatos do fork removidos"

# ------------------------------------------------------------------ 5 · decisao ---------------
azul "4 · O onboarding roda na Polygon de verdade agora"
# TUBARAO-22 · N2 · 2026-08-22 · a confirmacao tem de dizer TUDO que vai
# acontecer, nao parte. Este texto listava so o cofre e o deposito enquanto o
# fluxo, a partir do passo 4b, tambem implanta a estrategia e o guard — dois
# contratos e o gas deles, DEPOIS do ponto em que a pessoa ja digitou USUARIO.
# Confirmar parte e nao confirmar: quem le a lista curta assina a longa.
amarelo "  Vai acontecer, nesta ordem, e tudo gasta gas seu:"
amarelo "    1. o cofre nasce em $COFRE  (proxy ERC-1967)"
amarelo "    2. a estrategia e IMPLANTADA — contrato novo, seu, imutavel"
amarelo "    3. a camada de guard e IMPLANTADA — contrato novo, seu"
amarelo "    4. o cofre e configurado: ativo, moeda-base, estrategia, limites"
amarelo "    5. voce aprova e deposita $(cast --to-unit "$DEPOSITO" mwei) $SIMBOLO"
amarelo ""
amarelo "  Sao 3 contratos implantados e cerca de 11 transacoes. A carteira vai"
amarelo "  abrir mais de uma vez."
amarelo "  O dinheiro fica seu: withdraw esta disponivel a qualquer momento, sem depender do servico."
printf '\n  Digite USUARIO para seguir: '
read -r OK
[ "$OK" = "USUARIO" ] || { echo "  abortado, nada foi gasto"; exit 0; }

# --gas-estimate-multiplier 200 NAO e superstição: e conserto de uma armadilha
# medida em 2026-08-22, na primeira execucao real deste fluxo em mainnet.
#
# O `forge script` simula a sequencia inteira num UNICO contexto EVM. Ali os
# slots de storage ficam QUENTES de uma chamada para a seguinte. Na chain cada
# transacao comeca com storage FRIO, e pelo EIP-2929 o acesso frio custa 2.100
# contra 100 do quente. A estimativa nasce baixa, e o quanto ela erra depende de
# quantos slots a tx toca — nao de um percentual fixo.
#
# O que aconteceu: o deposit foi enviado com gasLimit 104.274, gastou 101.439
# (97,3% do limite, a assinatura de out-of-gas) e reverteu. Medido depois contra
# a chain: eth_call do mesmo deposit NAO reverte, e estimateGas devolve 107.511.
# Faltaram 3.237 de gas. Sete transacoes passaram, a oitava morreu, e o usuario
# ficou com um cofre configurado e vazio — pagando o gas das oito.
#
# O padrao 130% do forge nao cobriu. 200% cobre com folga e o excedente NAO e
# cobrado: gas nao usado volta. O preco de errar para mais e zero; o de errar
# para menos e uma transacao perdida no meio de uma sequencia.
forge script script/user/UserFlow.s.sol --tc UserFlow --rpc-url "$RPC" "${FORGE_SIGN[@]}" \
    --broadcast --slow --gas-estimate-multiplier 200

# --------------------------------------------------------- 4b · o guard -----------------------
# MEDUSA-01 · N1 · 2026-08-22 · o fluxo ANUNCIAVA uma camada de guard e entregava
# zero. A causa esta em UserFlow.s.sol:94 —
#
#     if (config.guard != address(0)) AddGuardLib.run(vault, config.guard);
#
# e este script nunca declarou GUARD, entao a condicao nunca era verdadeira e o
# `new ExampleFullBackingGuard()` do 06_AddGuard NUNCA rodava pelo UserFlow. O
# cofre nascia com guards() vazio, e o fluxo de nove passos entregava oito.
#
# HAVIA DUAS SAIDAS E ESTA E A MAIS SEVERA. A outra era tirar a promessa do
# fluxo — mais simples, e reduz protecao. Entregar aumenta, e o custo e um deploy
# a mais de gas do dono.
#
# NAO foi preciso tocar em Solidity: o 06_AddGuard e idempotente por construcao —
# com GUARD vazio e nenhum guard no cofre ele implanta e pluga; com guard ja
# plugado ele nao faz nada e diz isso. Invoca-lo como passo proprio entrega o que
# o UserFlow pula, sem alterar contrato nem a condicao da linha 94.
azul "4b · A camada de guard"
set +e
forge script script/user/actions/06_AddGuard.s.sol --tc AddGuard --rpc-url "$RPC" \
    "${FORGE_SIGN[@]}" --broadcast --gas-estimate-multiplier 200
GUARDA=$?
set -e
[ $GUARDA -eq 0 ] || morre "o guard nao foi plugado — o cofre existe e esta financiado, mas sem a camada.
       Rode de novo: os passos ja feitos sao idempotentes e nao repetem gasto."

# ------------------------------------------------------------------ 6 · conferir --------------
azul "5 · Conferindo o cofre na chain"
FALHOU=0
# `cast call` nao devolve um valor: devolve um valor E, para inteiros largos, uma
# anotacao cientifica ao lado — `1000000 [1e6]`. Comparar isso como TEXTO contra
# `1000000` reprova um cofre CORRETO, e foi exatamente o que aconteceu em
# 2026-08-22, na primeira execucao real deste fluxo em mainnet:
#
#   FALHA USDC dentro do cofre = 1000000 [1e6] (esperado 1000000)
#   PARADO: o cofre nasceu torto
#
# com os dois lados IGUAIS. O cofre estava certo; o comparador e que estava
# errado, e o script acusou o unico deposito bem-sucedido de ter nascido torto.
# Guardiao que grita sem motivo ensina a ignorar guardiao — e o proximo grito, o
# verdadeiro, tambem sera ignorado.
#
# Alem da anotacao ha mais duas diferencas que nao sao diferenca:
#   endereco  EIP-55 e checksum de DIGITACAO, nao identidade: 0xAb… e 0xab… sao
#             o MESMO contrato, e reprovar por caixa ensina a contornar a trava.
#   numero    zeros a esquerda nao mudam o valor. A comparacao e feita como
#             TEXTO depois de corta-los, e nao com `-eq`: valores em wei passam
#             de 9,2e18 e a aritmetica de 64 bits do shell erraria calada.
normaliza() {
    printf '%s' "$1" | sed 's/[[:space:]]*\[[^]]*\]//g' | tr -d '\r' \
        | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

confere() {
    local esperado rotulo got igual
    esperado=$(normaliza "$1"); rotulo=$2; shift 2
    got=$(normaliza "$(cast call "$@" --rpc-url "$RPC")")
    igual=0

    if [ "$got" = "$esperado" ]; then
        igual=1
    elif printf '%s' "$got" | grep -Eq '^0x[0-9a-fA-F]{40}$' \
      && printf '%s' "$esperado" | grep -Eq '^0x[0-9a-fA-F]{40}$' \
      && [ "$(printf '%s' "$got" | tr 'A-F' 'a-f')" = "$(printf '%s' "$esperado" | tr 'A-F' 'a-f')" ]; then
        igual=1
    elif printf '%s' "$got" | grep -Eq '^[0-9]+$' \
      && printf '%s' "$esperado" | grep -Eq '^[0-9]+$' \
      && [ "$(printf '%s' "$got" | sed 's/^0*\(.\)/\1/')" = "$(printf '%s' "$esperado" | sed 's/^0*\(.\)/\1/')" ]; then
        igual=1
    fi

    if [ "$igual" = "1" ]; then verde "  ok    $rotulo = $got"
    else printf '\033[0;31m  FALHA %s = %s (esperado %s)\033[0m\n' "$rotulo" "$got" "$esperado"; FALHOU=1; fi
}

confere "$USUARIO"  "o dono e o usuario"       "$COFRE" 'owner()(address)'
confere "$REG"      "le o registry do protocolo" "$COFRE" 'REGISTRY()(address)'
confere "18"        "decimais do ativo"        "$COFRE" 'assetDecimals(address)(uint8)' "$ASSET"
confere "6"         "decimais da base"         "$COFRE" 'baseCurrencyDecimals(address)(uint8)' "$BASE"
confere "$DEPOSITO" "$SIMBOLO dentro do cofre"     "$BASE"  'balanceOf(address)(uint256)' "$COFRE"

# MEDUSA-01 · a conferencia tem de MEDIR o que o passo 4b passou a entregar.
# Sem esta linha o guard poderia falhar em silencio e o script ainda diria que o
# cofre nasceu inteiro — que e exatamente o defeito que MEDUSA-01 descreve, so
# que um nivel acima: portao que nao mede a camada nova nao a protege.
GUARDS=$(cast call "$COFRE" 'guards()(address[])' --rpc-url "$RPC" | tr -d '[] \r')
if [ -n "$GUARDS" ]; then verde "  ok    guard plugado = $GUARDS"
else printf '\033[0;31m  FALHA guards() esta VAZIO — o cofre nao tem a camada que o fluxo anuncia\033[0m\n'; FALHOU=1; fi

ESTRATEGIA=$(cast call "$COFRE" 'strategy()(address)' --rpc-url "$RPC")
verde "  ok    estrategia plugada = $ESTRATEGIA"
PISO=$(cast call "$ESTRATEGIA" 'MIN_OUT_PER_TICKET()(uint256)' --rpc-url "$RPC" | awk '{print $1}')
if [ "$PISO" = "$MIN_OUT_PER_TICKET" ]; then verde "  ok    piso de compra = $PISO (nao zero)"
else printf '\033[0;31m  FALHA piso = %s\033[0m\n' "$PISO"; FALHOU=1; fi

[ $FALHOU -eq 0 ] || morre "o cofre nasceu torto"

azul "O fluxo da pasta funciona em mainnet."
echo "  cofre    $COFRE"
echo "  dono     $USUARIO"
echo "  saldo    $(cast --to-unit "$DEPOSITO" mwei) $SIMBOLO"
echo
echo "  Para tirar o dinheiro a qualquer momento:"
echo "    cast send $COFRE 'withdraw(address,uint256,address)' $BASE $DEPOSITO $USUARIO --rpc-url polygon --account $USUARIO_ALIAS"
