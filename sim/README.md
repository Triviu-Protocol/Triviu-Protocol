# /sim — run everything on a local Polygon fork

The official path is **local fork → testnet (Amoy) → audit → mainnet**, and
that order is not a suggestion. Mistakes on a fork are free; everywhere else
they pay gas.

## Prerequisites

- [Foundry](https://getfoundry.sh) (`anvil`, `forge`)
- Node 20
- A Polygon RPC endpoint (prefer a self-hosted node or redundant providers —
  litepaper §6, infrastructure risk)

## Step 1 — local fork (mistakes here are free)

```bash
export POLYGON_RPC="your-rpc-url"
anvil --fork-url $POLYGON_RPC --chain-id 31337
```

## Step 2 — contracts

```bash
cd contracts
forge install foundry-rs/forge-std
forge build
forge test -vvv
```

## Step 3 — engine (dry_run=true by default — it does NOT send transactions)

```bash
cd ../engine
npm install
cp config/params.example.toml config/params.toml
# Edit params.toml: rpc_url = "http://127.0.0.1:8545", dry_run = true
npm run dev
```

## What "working" looks like

- `forge test` green in `contracts/`
- The engine printing detected cycles and fork-simulation results **without
  sending a single transaction**

Only after that does testnet (Amoy) make sense — and nothing touches mainnet
before an external audit ([SECURITY.md](../SECURITY.md)).
