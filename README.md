<p align="center">
  <img src="brand/simbolo.svg" width="120" alt="Triviu mark: a three-node cycle with directional arcs"/>
</p>

<h1 align="center">Triviu</h1>

<p align="center"><em>Open source. Verifiable math. No promises.</em></p>

<p align="center">
  <code>EVM · Polygon first</code> · <code>AGPL-3.0</code> · <code>v0 — pre-testnet, NOT AUDITED</code> · <code>no token</code>
</p>

---

> ### ⚠ RISK NOTICE — REQUIRED READING
> Most atomic-arbitrage opportunities — on any chain — are captured by professional
> operators. For most individual users, the expected result after gas costs
> tends toward **zero or negative**. Triviu is **educational infrastructure** —
> it is not a source of income. Reverted transactions still pay gas.

## What this is

A non-custodial, open-source protocol to **execute, simulate and study atomic
triangular arbitrage** on EVM DEXs — **Polygon first**, with the same audited
contracts designed for **Arbitrum** and **BSC** ([expansion records](decisions/)) —
paired with the educational layer that teaches anyone to read, audit and run this
code themselves. Founding document: [`whitepaper/`](whitepaper/README.md)
(the older `docs/triviu-litepaper-v0.1.md` is superseded by it).

**What Triviu is NOT:** it does not custody funds, does not raise capital, does
not issue a token, does not sell signals, does not promise returns. If anyone
offers any of those things in Triviu's name, it is a scam — report it.

**How it sustains itself:** an on-chain **success fee on profit only** — taken
atomically, capped at 50% of profit in bytecode, zero on reverts or break-even.
The protocol earns only when the user does ([whitepaper §5](whitepaper/05-success-fee.md)).

## Don't trust: verify

| What | Where |
|---|---|
| Whitepaper (canonical, EN) | [`whitepaper/`](whitepaper/README.md) — 16 sections |
| Interactive simulator (any chain, no wallet) | [triviu.vercel.app/simulate](https://triviu.vercel.app/simulate) — Polygon · Arbitrum · BSC |
| Decisions and their costs (trilemma) | [`decisions/`](decisions/) — numbered Tradeoff Records (0001 Polygon · 0004 Arbitrum · 0005 BSC · 0006 Solana deferred) |
| Contracts (v0, unaudited) | [`contracts/src/`](contracts/src/) |
| Verified addresses (each chain's explorer) | _to be published at first mainnet deployment, per chain_ |
| Public dashboard, failures included | [`dashboard/`](dashboard/) — _Dune, to be published_ |
| Brand and communication rules | [`brand/`](brand/) |

## Repository map

```
contracts/   Atomic Executor + ParameterRegistry (Foundry)
engine/      Off-chain engine: pool graph, Bellman–Ford, simulation (TypeScript)
sim/         How to run everything on a local Polygon fork — start HERE
decisions/   Tradeoff Records: every decision states what it gains and what it costs
docs/        Runbooks, audits, and the historical litepaper (superseded)
brand/       Mark, design tokens and manual (CC BY 4.0)
dashboard/   Public dashboard queries (failures included, always)
site/        Landing page (EN canonical, ES toggle) — single HTML file
```

## Getting started — always through the fork

The official path is **local fork → audit → mainnet**, and that order is not a
suggestion. The fork is where you rehearse and verify for free:

```bash
# 1. Local Polygon fork (mistakes here are free)
anvil --fork-url $POLYGON_RPC

# 2. Contracts
cd contracts && forge build && forge test

# 3. Engine (dry_run=true by default — it does NOT send transactions)
cd ../engine && npm install && cp config/params.example.toml config/params.toml
npm run dev
```

Full guide in [`sim/README.md`](sim/README.md).

## How to change a parameter

1. Open an issue with the **Parameter proposal** template (it includes the
   trilemma axis affected and the cost accepted).
2. PR changing `engine/config/` after public discussion.
3. Merge → the on-chain mirror is updated in the `ParameterRegistry`, and the
   event records **the PR URL**: the forum → Git → block trail is complete.

## Principles (whitepaper §2)

Absolute non-custody · open source · radical transparency · **no promises** ·
**no token** · education before execution · labeled AI.
And, structuring everything, the trilemma: *Triviu doesn't solve the trilemma —
it travels it and documents the price of every lap*
([`decisions/0001`](decisions/0001-polygon-pos.md)).

## Licenses

Code: **AGPL-3.0** ([LICENSE](LICENSE)) · Brand and manual: **CC BY 4.0**
([brand/](brand/)) · Docs: CC BY-SA 4.0. Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) ·
Vulnerabilities: [SECURITY.md](SECURITY.md).
