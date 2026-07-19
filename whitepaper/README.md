---
description: >-
  An open protocol for atomic arbitrage and educational infrastructure in DeFi.
  Open source. Verifiable math. No promises.
---

# Triviu Whitepaper

> **Version:** whitepaper v1 · July 2026
> **Network:** Polygon PoS · **Code:** AGPL-3.0 · **Brand:** CC BY 4.0
> **Status:** pre-mainnet, not yet deployed

{% hint style="warning" %}
**Risk notice — required reading.** Most atomic-arbitrage opportunities on
Polygon are captured by professional operators. For most individual users, the
expected result after gas **and fee** tends toward zero or negative. Triviu is
educational infrastructure — it is not a source of income for the user. Reverted
transactions still pay gas.
{% endhint %}

## Abstract

Triviu is a non-custodial, open-source protocol for executing atomic triangular
arbitrage on decentralized exchanges (DEXs) on the Polygon network, paired with
an educational layer that teaches anyone to read, audit, simulate and run the
code themselves. The protocol does not custody third-party funds, does not raise
capital, does not issue a token and does not promise returns. Its only
proposition is verifiable technology: verified on-chain contracts, public
Git-versioned parameters, open execution data, and a success fee charged only
when a cycle actually profits — taken atomically, on-chain, and capped in
bytecode at half of profit.

Just as Bitcoin proposed electronic transactions without relying on trust in
intermediaries, Triviu proposes DeFi education without relying on trust in
promises: only code, mathematics and on-chain evidence. This document goes
further than most whitepapers in one direction on purpose — it publishes, with
academic sources, the reason an individual is unlikely to profit at all. That
honesty is not a disclaimer bolted on at the end; it is the product.

## Thesis

> A protocol that teaches you to read the contract must also teach you to read the
> odds. Triviu offers not an outcome, but the ability to verify one — including
> the ability to verify that it is unlikely.

## How this document is organized

This whitepaper is the complete reference. [Motivation](01-motivation.md) and
[Principles](02-principles.md) state what Triviu is and refuses to be. The
[arbitrage mathematics](03-triangular-arbitrage.md) — derived from first
principles with primary sources — the [architecture](04-architecture.md), the
[success fee](05-success-fee.md) and the [Gas-Tank](06-gas-tank.md) are the
technical core. [Transparency](07-transparency.md), the
[economic reality](08-risks.md) (with academic data on MEV and searcher
concentration) and [security and audits](09-security-and-audits.md) document the
limits with the same prominence as the capabilities.
[Education](10-education.md), [sustainability](11-sustainability.md),
[governance](12-governance.md), the [trilemma](13-trilemma.md) and the
[roadmap](14-roadmap.md) frame the project; [the mark](15-the-mark.md) reads the
logo as an argument; the [conclusion](16-conclusion.md) and
[references](references.md) close it. Nothing here is asked to be trusted.

## What Triviu is NOT

- It does **not** custody funds — no deposit function exists anywhere.
- It has **no token**, presale, allocation or yield program, and none is planned.
- It sells **no signals**, premium groups or guaranteed strategies.
- It promises **no returns** — possibility is not probability.
- It does **not** solve the trilemma — it travels it and documents the cost.

If anyone offers any of those things in Triviu's name, it is a scam — report it.

---

*Triviu — Open source. Verifiable math. No promises.*
