# Deploy · Polygon PoS

Nothing of this line is deployed. `deployments/` holds only `999999.json`, the local chain. This
file is the runbook for the first genesis, written to be followed once and then re-read before any
repeat.

## The Safe is governance, not the deployer

A Safe cannot sign a raw creation transaction, and the genesis is one run that deploys six
contracts, performs four acts of curation and hands over `DEFAULT_ADMIN_ROLE`. So the roles split
the way the contracts already require:

| Role | Who | Why |
|---|---|---|
| `GOVERNANCE` | **your Safe** | receives `DEFAULT_ADMIN_ROLE` at the end of the run and keeps it |
| deployer | a fresh hot EOA | signs the creations, is admin for the length of one transaction, and **renounces in the same run** |
| `OPERATOR` | the service key, hot | may trigger executions; cannot withdraw or configure |
| `TREASURY` | wherever fees land | may be the Safe |

`validate()` refuses the run before it costs gas if `GOVERNANCE` equals the deployer, if `OPERATOR`
equals the deployer or `GOVERNANCE`, if any is the zero address, or if the base token is not a
6-decimal contract. Those are not conventions — they are checks in `script/01_Deploy.s.sol`.

**The deployer key is disposable by design.** After the run it holds no role. Create it for this,
fund it with a few POL, and never reuse it.

## Base currency

Both are verified on-chain, both pass the 6-decimal check:

| Address | `name()` | |
|---|---|---|
| `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | USD Coin | **native, Circle-issued** |
| `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | USD Coin (PoS) | bridged, the older USDC.e |

Use the native one unless a venue you route through has liquidity only in the bridged token. That
is a routing question, not a protocol one.

## 1 · Fill the environment

```bash
cd contracts
cp .env.example .env
```

Then set, in `.env`:

```bash
POLYGON_RPC_URL=<your endpoint>

GOVERNANCE=<your Safe address>
TREASURY=<where fees land>
OPERATOR=<the service key, an EOA, not the Safe>
BASE_TOKEN=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
FEE_BPS=50
```

`FEE_BPS` is in basis points and `50` is half a percent. The ceiling is `100` and it is an
immutable constant — not even governance passes one percent.

## 2 · Create the deployer key

```bash
cast wallet import triviu-deployer --interactive
cast wallet address --account triviu-deployer
```

Send it a little POL. A genesis run is well under one POL at ordinary gas.

## 3 · Rehearse against a fork, before spending anything

```bash
anvil --fork-url "$POLYGON_RPC_URL" &
forge script script/01_Deploy.s.sol --tc Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```

This runs the real genesis against a copy of real Polygon state. If `validate()` is going to refuse
your configuration, it refuses here, for free.

**Clean up after the rehearsal, and this is not tidiness.** The fork reports itself as chain 137,
so the run writes `deployments/137.json`, `broadcast/01_Deploy.s.sol/137/` and the matching cache —
the same paths a real mainnet genesis writes. `.gitignore` excludes only the `999999` local-chain
records, so a rehearsal left behind and committed makes the repository claim a mainnet deployment
that never happened:

```bash
rm -rf deployments/137.json broadcast cache
```

Rehearsed on 2026-08-22 at fork block 92474476, and the numbers below came from that run rather
than from an estimate:

| | |
|---|---|
| Gas for the whole genesis | **10,928,358** |
| Cost at that block's price (578 gwei) | 6.32 POL |

The five post-deploy checks in section 5 were run against the fork and returned `true true true
true false` in that order — including the last one, the deployer no longer holding admin.

## 4 · The genesis

```bash
forge script script/01_Deploy.s.sol --tc Deploy \
  --rpc-url polygon --account triviu-deployer --broadcast --slow
```

One run. Six contracts, four acts of curation — publishes the implementation, curates the base
currency, curates the `Executor`, grants the operator role — then grants admin to `GOVERNANCE` and
renounces. The record is written to `deployments/137.json` only when a real broadcast happened.

## 5 · Confirm on the chain, not in the log

```bash
cast call <protocolRegistry> "isBaseCurrency(address)(bool)"  <BASE_TOKEN>   --rpc-url polygon
cast call <protocolRegistry> "isExecutor(address)(bool)"      <executor>     --rpc-url polygon
cast call <protocolRegistry> "isOperator(address)(bool)"      <OPERATOR>     --rpc-url polygon
cast call <protocolRegistry> "hasRole(bytes32,address)(bool)" 0x0000000000000000000000000000000000000000000000000000000000000000 <GOVERNANCE> --rpc-url polygon
cast call <protocolRegistry> "hasRole(bytes32,address)(bool)" 0x0000000000000000000000000000000000000000000000000000000000000000 <deployer>   --rpc-url polygon
```

The first four must return `true`. **The last must return `false`** — that is the deployer having
renounced. A genesis where the deployer still holds admin is a genesis to redo, and the deploy log
will not tell you: only the chain will.

## 6 · Verify the sources

```bash
forge verify-contract <address> <Contract> --chain polygon --watch
```

Verify all six. Until then nobody can read what they are trusting, and this repository asks people
to trust it.

## What is deliberately not here

- **No canary and no staged rollout.** A genesis is atomic: it either completes or reverts.
- **No upgrade in this runbook.** `ImplementationRegistry` plus the owner's timelock govern that,
  and it is a different procedure.
- **No mainnet money before an external audit.** The three audits on record for this line are
  internal, and `SECURITY.md` says so.
