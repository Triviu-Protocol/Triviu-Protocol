---
description: >-
  An open protocol for atomic arbitrage and educational infrastructure in DeFi.
  Open source. Verifiable math. No promises.
---

# Triviu Whitepaper

> **Version:** whitepaper v1 (draft) · built on litepaper v0.1
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
Git-versioned parameters, open execution data, and a success fee that is charged
only when a cycle actually profits — taken atomically, on-chain, and capped in
bytecode.

Just as Bitcoin proposed electronic transactions without relying on trust in
intermediaries, Triviu proposes DeFi education without relying on trust in
promises: only code, mathematics and on-chain evidence.

## How this document is organized

This whitepaper expands the [litepaper v0.1](../docs/triviu-litepaper-v0.1.md)
into a complete reference. The [Motivation](01-motivation.md) and
[Principles](02-principles.md) state what Triviu is and refuses to be. The
[arbitrage math](03-triangular-arbitrage.md), the [architecture](04-architecture.md),
the [success fee](05-success-fee.md) and the [Gas-Tank](06-gas-tank.md) are the
technical core. [Transparency](07-transparency.md), [risks](08-risks.md) and
[security and audits](09-security-and-audits.md) document the limits with the
same prominence as the capabilities. [Education](10-education.md),
[sustainability](11-sustainability.md), [governance](12-governance.md), the
[trilemma](13-trilemma.md) and the [roadmap](14-roadmap.md) close the picture.

## What Triviu is NOT

- It does **not** custody funds — no deposit function exists anywhere.
- It has **no token**, presale, allocation or yield program, and none is planned.
- It sells **no signals**, premium groups or guaranteed strategies.
- It promises **no returns** — possibility is not probability.
- It does **not** solve the trilemma — it travels it and documents the cost.

If anyone offers any of those things in Triviu's name, it is a scam — report it.

---

*Triviu — Open source. Verifiable math. No promises.*
