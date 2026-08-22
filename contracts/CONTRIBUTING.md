# Contributing

## Getting the repository to build

```sh
git clone --recurse-submodules <repo-url> triviu-protocol
cd triviu-protocol
cp .env.example .env
forge build
forge test
```

`forge-std` and `openzeppelin-contracts` are submodules. If you cloned without
`--recurse-submodules`, run `git submodule update --init --recursive` before building.

## What CI runs

Four steps, in `.github/workflows/test.yml`. Run them before opening a pull request and there will
be no surprises:

```sh
forge fmt --check
forge build --sizes --skip 'test/**'
forge test
sh script/abi.sh && git diff --exit-code -- abi/
```

The size gate skips `test/**` on purpose. `forge --sizes` already drops contracts inheriting
`Test`/`Script`, and the invariant `Handler` inherits neither — the runner calls its functions
directly — so it lands in the report with the initcode of the nine contracts its constructor
deploys. The EIP-170 and EIP-3860 limits describe what reaches a chain, and a test harness does not.

`abi/` is generated and committed, because a consumer should not need Foundry to obtain it. CI runs
the same `script/abi.sh` you run and fails on a diff, so regenerate and commit whenever a public
interface changes.

## Line endings

`.gitattributes` pins everything to LF, and this is not a style preference. `solc` hashes the source
text into the contract metadata, so a checkout with CRLF compiles to a different metadata hash than
one with LF, and verification on a block explorer then fails against a build made elsewhere. The
cause never appears in a diff.

If you script anything that rewrites a source file, write bytes or set the newline explicitly —
Python's `write_text` on Windows translates `\n` to `\r\n` and will silently convert a whole file.
`forge fmt --check` catches it, which is one more reason to run CI's four steps locally.

## Tests

Coverage of the happy path is the least of it. What this repository asks for:

**A test that enumerates is a list with a maintenance obligation.** `test_everySetterIsAdminOnly`
asserts that a stranger is rejected on each privileged setter, and
`test_theFourActsOfCurationHappen` asserts each act of the genesis. Neither fails when it falls
behind — a shorter list is still a green list. Adding a setter to `ProtocolRegistry`, or an act to
the genesis, includes adding the line. The count in the second name is deliberate.

**A guard needs a test that fails when the guard is removed.** Before claiming a check is covered,
delete the check, run the test, and see it go red. A test that stays green without the code it
supposedly guards is documentation with test syntax. Every security check in `src/` has been through
this, and the reverts they produce are named in `IVaultExecutionEE`.

**Floors are the owner's, not the protocol's.** There is no oracle here. `Intent.minOut` is the
least the owner accepts, `operatorMinOut` is declared by whoever submits, and `Limits.minRatioBps`
compares the *declared* `minOut` and never the realised amount. A `Strategy` that declares no floor
on its buy leg leaves the vault accepting a route that returns nothing — which is why
`ExampleStrategy` refuses a zero `MIN_OUT_PER_TICKET` instead of defaulting to it.

**And scale a floor with `Math.Rounding.Ceil`, never the default rounding.** `ExampleStrategy`
first shipped its proportional floor rounded down, which let it reach exactly zero whenever
`MIN_OUT_PER_TICKET × amountIn < TICKET` — with a floor of `1`, on every partial buy. The
constructor's refusal of zero was then a check satisfiable without protecting, and refusing zero is
precisely what teaches someone to type `1`. Demanding slightly more than proportional is the error
a floor should make; the reverse is how a guard becomes decoration.

## Static analysis

```sh
slither .
```

`slither.config.json` is versioned, so everyone runs the same analysis. It filters `lib` and `test`
and drops informational and low findings; `script` stays **in**, because the genesis decides what
the protocol looks like on day one and deserves to be analysed.

**No detector is suppressed.** A suppressed detector is a gate that stopped measuring, and it stops
silently. What is suppressed instead is two individual findings, by content, in
`slither.db.json` — the triage database Slither reads.

Both are `reentrancy-balance` on `Executor.run`, and both are false here: the guard is
`bool private transient _running` (EIP-1153), with a check-set-clear pattern, and Slither 0.11.6
does not model transient storage. `TriviuVault._entered` is the same pattern and produces the
`reentrancy-no-eth` findings that remain visible at Medium.

The difference matters. With the triage database, zero HIGH; without it, those two return. A
`reentrancy-balance` appearing anywhere else still fails the build, because the detector never
stopped running. If you change `Executor.run`, the finding's content changes with it and the entry
stops matching — which is the point.

Twelve findings without the database, ten with it. CI fails only on HIGH
(`.github/workflows/ci.yml`), so the ten Medium are visible and not blocking.

The right way to judge a change is a **baseline comparison**, not a count. Run Slither on the parent
commit in a separate worktree and compare sets:

```sh
git worktree add /tmp/baseline HEAD~1
(cd /tmp/baseline && slither .)
```

A finding count means little on its own; a finding that appears where there was none is the signal.

## Style

Solidity 0.8.28, `forge fmt` is the authority. Beyond what the formatter enforces:

- Custom errors, never `require` strings.
- NatSpec on every external and public function: `@notice`, `@dev`, `@param`, `@return`.
- An event on every state mutation.
- Constants and immutables instead of literals.
- Checks-Effects-Interactions on anything touching an external call.

## Commits

`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, with a scope where it helps —
`fix(ci):`, `feat(protocol):`. Messages in English.

Say what changed and what was measured. A commit that fixes a security hole should carry the number
that shows the hole was real; a commit that changes a limit should carry the limit. Adjectives are
not evidence.

## Security

Do not open a public issue or pull request for a vulnerability. `SECURITY.md` has the channel.
