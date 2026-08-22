#!/usr/bin/env sh
# Regenerates abi/ from the compiled artifacts.
#
# The ABIs are committed because the site and any front end consume them, and a consumer should not
# need Foundry to obtain them. Committed generated files rot in silence, so CI runs this same script
# and fails on a diff — see the "ABIs are current" step in .github/workflows/test.yml. That is why
# this is a script and not a line in the workflow: local and CI must run the same bytes, or the
# check compares generation methods instead of content.
#
#   sh script/abi.sh
#
set -eu

# Anchored to the repository root, because this script runs `rm -rf abi` and a relative path would
# make the target depend on where you happened to be standing.
cd "$(dirname "$0")/.."

# The deployable surface. Libraries and mixins are not here: nothing outside this repository calls
# them directly, and `TriviuVault` already exposes the mixins through its own ABI.
CONTRACTS="TriviuVault VaultFactory ProtocolRegistry ImplementationRegistry Executor EscapeHatch"

forge build >/dev/null

rm -rf abi
mkdir -p abi

for name in $CONTRACTS; do
    forge inspect "$name" abi --json > "abi/$name.json"
    printf '  abi/%s.json\n' "$name"
done
