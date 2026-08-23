#!/usr/bin/env sh
# Regenerates abi/ from the compiled artifacts.
#
# The ABIs are committed because the site and any front end consume them, and a consumer should not
# need Foundry to obtain them. Committed generated files rot in silence, so CI runs this same script
# and fails on a diff — see the "ABIs are current" step in .github/workflows/ci.yml. That is why
# this is a script and not a line in the workflow: local and CI must run the same bytes, or the
# check compares generation methods instead of content.
#
#   sh script/abi.sh
#
set -eu

# Anchored to the repository root, because a relative path would make the target depend on where you
# happened to be standing.
cd "$(dirname "$0")/.."

# The deployable surface. Libraries and mixins are not here: nothing outside this repository calls
# them directly, and `TriviuVault` already exposes the mixins through its own ABI.
CONTRACTS="TriviuVault VaultFactory ProtocolRegistry ImplementationRegistry Executor EscapeHatch"

forge build >/dev/null

# Apaga o que ESTE script gera, e nao a pasta inteira. `abi/SUPERFICIE.md` mora aqui e e escrito a
# mao; `rm -rf abi` o levava junto em toda execucao, e o passo "ABIs are current" — que roda este
# script e depois `git diff --exit-code -- abi/` — via a DELECAO do documento e a reportava como
# "abi/ esta velho". A esteira ficou vermelha assim desde 3d855c9, o commit que criou o documento,
# e a mensagem de erro mandava rodar exatamente o comando que causava o problema.
# O `rm` continua existindo para o caso que motivou o `-rf`: um contrato tirado de CONTRACTS deve
# perder o seu .json. Apagar por extensao faz isso sem destruir o que o script nao produz.
mkdir -p abi
rm -f abi/*.json

for name in $CONTRACTS; do
    forge inspect "$name" abi --json > "abi/$name.json"
    printf '  abi/%s.json\n' "$name"
done
