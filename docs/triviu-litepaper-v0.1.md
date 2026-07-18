# Triviu

**An open protocol for atomic arbitrage and educational infrastructure in DeFi**

Litepaper v0.1 — July 2026
Network: Polygon PoS · Code license: AGPL-3.0 · Authors: Triviu Contributors
*Canonical version (English). This is the source of truth for the protocol.*

---

## Abstract

Triviu is a non-custodial, open-source protocol for executing atomic triangular arbitrage on decentralized exchanges (DEXs) on the Polygon network, paired with an educational layer that teaches anyone to read, audit, simulate and run the code themselves. The protocol does not custody third-party funds, does not raise capital, does not issue a token and does not promise returns. Its only proposition is verifiable technology: verified on-chain contracts, public Git-versioned parameters, IPFS-mirrored documentation and open execution data. Just as Bitcoin proposed electronic transactions without relying on trust in intermediaries, Triviu proposes DeFi education without relying on trust in promises: only code, mathematics and on-chain evidence.

---

## 1. Motivation

The DeFi ecosystem is saturated with "profit bots" sold as black boxes: closed code, unverifiable results and marketing built on income expectations. The user is invited to trust exactly where they should be able to verify.

Bitcoin's central lesson was the inversion of that model: *don't trust, verify*. Satoshi Nakamoto did not sell access to a system — they published a paper and working code, and let anyone verify every claim.

Triviu applies that principle to a specific domain: triangular arbitrage on DEXs. Instead of selling access to a black box, we publish the box open — the contract, the engine, the simulator, the parameters and, with equal prominence, the real economic limits of this strategy.

## 2. Principles

1. **Absolute non-custody.** The protocol never holds third-party funds. Every execution happens inside a single transaction, with principal and result returning to the caller. The success fee (Section 4.6) is taken inside that same transaction — the contract keeps no balance afterwards.
2. **Open source.** Public repository under AGPL-3.0, signed releases, open CI.
3. **Radical transparency.** Verified contracts, a public execution dashboard (failures included), parameters with full Git history, and a fee taken on-chain and emitted on every cycle.
4. **No promises.** No return projections, in any material. Possibility is not probability — and Section 6 documents why. A success fee is the opposite of a promise: the protocol earns only when the user does.
5. **No token.** Triviu has no token, presale, allocation or yield program, and none is planned.
6. **Education before execution.** The default user path goes through a local fork and testnet before any mainnet transaction.
7. **Labeled AI.** All content presented by a synthetic persona is identified as AI-generated, on every channel and in every piece.

## 3. Triangular arbitrage

A triangular arbitrage exploits momentary price discrepancies across three liquidity pools, traversing the cycle A → B → C → A within **a single atomic transaction**. If, at the end of the cycle, the amount of A obtained does not exceed the initial amount plus costs, the transaction reverts entirely — no leg is left exposed.

For an initial volume `V` in asset A, effective exchange rates `r₁, r₂, r₃` (already reflecting price impact) and pool fees `φ₁, φ₂, φ₃`:

```
Gross profit = V · [ r₁·r₂·r₃ · (1−φ₁)(1−φ₂)(1−φ₃) − 1 ]

Execution condition: Gross profit − G ≥ minProfit
```

where `G` is the gas cost denominated in A. If the condition is not met at execution time, the contract reverts.

Opportunity detection is equivalent to searching for negative cycles in the graph of `−log(price)` between pairs — a classic problem solvable with Bellman–Ford — implemented in the open-source off-chain engine.

## 4. Architecture

### 4.1 Executor contract (on-chain)

A *stateless*, verified contract. It receives the route as calldata, obtains the capital from the caller itself (or via flash loan), executes the three legs, applies the `minProfit` check and returns principal and result to the caller within the same transaction. It keeps no balances between transactions and has no deposit function. At no point in the system does custody of third-party funds exist.

### 4.2 Parameter Registry (on-chain)

Stores, with versioning, the enabled route and token lists, slippage caps and default `minProfit` values. Changes go through a timelocked multisig, and every on-chain change mirrors a previously discussed public pull request. The full parameter history lives in Git.

### 4.3 Flash loans (optional)

Integration with established Polygon providers (Aave v3, Balancer Vault) allows execution without idle capital of one's own. Gas is still paid by the caller: if the cycle is not profitable, the transaction reverts and only the gas is lost.

### 4.4 Off-chain engine (open source)

Monitors pools via multicall/websocket, detects cycles, **simulates every route on a local Polygon fork (Foundry/Anvil) before any submission**, and sends transactions signed by the user's own key, which never leaves their machine.

### 4.5 Simulator and backtester

A reproducible fork-and-replay environment, allowing anyone to verify — with public data — the strategy's actual behavior before spending a single cent of gas.

### 4.6 Success fee (on-chain, profit-only)

The protocol sustains itself with a **success fee**: a percentage of a cycle's **profit only**, taken inside the same atomic transaction and routed to a public treasury before the remainder returns to the caller. There is no entry or setup fee. A reverted cycle and a break-even cycle pay **nothing** — the fee exists only where real profit above gas exists. This is what "we only earn if you earn" means, enforced by code rather than asserted in copy.

The rate is a `ParameterRegistry` parameter (changed via public pull request, mirrored on-chain), and the Executor **clamps it to a hardcoded ceiling of 50% of profit** — so no configuration, mistaken or malicious, can take more than half of a cycle's profit. If no treasury is set, the whole result returns to the caller. Every cycle emits both the caller's net profit and the fee, so the public dashboard shows exactly what the protocol took.

### 4.7 Gas-Tank (user gas-safety reserve, non-custodial)

A public, verifiable reserve that exists so an operation's return path is not left stuck in the block flow for want of gas. It is **not protocol revenue**: each account funds its own balance and is the only account that can withdraw it. Balances and movements are on-chain. The automated consumption path — spending a user's own reserve to complete a stuck leg — is a later milestone, specified and audited before it touches funds.

## 5. Operational transparency

- Contracts verified on Polygonscan.
- Public dashboard (Dune) with every execution, aggregates and the failure rate — failures included, not hidden.
- Documentation on the site with an IPFS mirror; signed releases; public CI.
- Parameter flow: public PR → open discussion → merge → on-chain update via timelock. A complete audit trail, from forum to block.

## 6. Risks and economic limits — required reading

This section is part of the protocol's identity. Any distribution of Triviu that omits it violates the spirit of the project.

**Professional competition (MEV).** Most atomic-arbitrage opportunities on Polygon are captured by professional *searchers* with dedicated infrastructure, minimal latency and block-production-level integrations (for example, via FastLane). An individual operator on ordinary hardware arrives, in most cases, later — within the same block.

**Realistic expectation.** For most individual operators, the expected result after gas **and fee** tends toward zero or negative. Triviu is educational and technical infrastructure — not a source of income for the user, and it must not be presented as one by anyone, including us. The protocol sustains itself through the success fee on the cycles that do profit (Section 4.6); that is true on both sides at once, without contradiction — the user is not promised a gain, and the protocol earns only where a real gain occurs.

**Gas and reverts.** Reverted transactions still pay gas. Atomicity eliminates market exposure; it does not eliminate cost. The success fee, by contrast, is charged only on profit — a revert costs gas but never a fee.

**Token risk.** Fee-on-transfer tokens, honeypots and manipulated liquidity exist. The Registry whitelist mitigates; it does not eliminate.

**Contract risk.** External audits reduce risk; no audit brings it to zero.

**Infrastructure risk.** RPCs and data providers are trust points external to the protocol; users should prefer self-hosted nodes or redundant providers.

## 7. Education and the AI persona

All of Triviu's educational content is presented by a synthetic persona, identified as AI in every channel biography and in every video or post. The curriculum is public and follows four pillars: (1) AMMs and pools from zero; (2) the anatomy of a real triangular arbitrage, with numbers — gas, slippage, competition; (3) "run it yourself," reading and executing the code on a fork and testnet; (4) wallet security and MEV literacy.

Non-negotiable editorial rule: show technology, never income. No Triviu material displays profit projections, earnings screenshots or get-rich language.

## 8. Sustainability

The protocol funds itself primarily through the **on-chain success fee** (Section 4.6) — a share of the profit on cycles that actually profit, taken atomically, capped in bytecode, and emitted for anyone to audit — complemented by ecosystem grants (Polygon and similar), on-chain donations to a public address, and B2B technical services (integration and consulting). There are no paid signals, no premium groups, no third-party capital management, and no product that depends on user deposits: the success fee is protocol revenue on a settled result, not a fee on custody or on a promise.

## 9. Governance

**Phase 1:** founding maintainers, with the Registry under a public multisig and timelock. **Phase 2:** a contributor council defined by verifiable merit (history of merged PRs). There is no governance token, and decisions remain auditable through the same flow: forum → PR → merge → on-chain.

## 10. Roadmap

- **v0** — this litepaper, public repository, fork simulator and testnet execution.
- **v0.2** — audited Executor on mainnet with a minimal whitelist; public execution dashboard.
- **v1** — Registry with an active timelock, complete educational curriculum, second external audit.

Consistent with principle 4: the roadmap is a statement of intent, not a schedule commitment.

## 11. Conclusion

We have proposed an arbitrage and education infrastructure that does not depend on trust: every rule is public, every execution is verifiable, every parameter has a history, and every limitation is documented with the same prominence as every capability. What Triviu offers is not an outcome — it is the ability to verify.

---

## A note on the name

*Triviu* derives from the Latin **trivium** — the meeting of three roads, and also the classical curriculum that founded all education (grammar, logic and rhetoric). Three routes in one cycle; education as foundation. The name is the project.

---

## Notice

This document is technical and educational in nature. It does not constitute an investment offer, a security, a solicitation of funds, financial advice or a promise of returns. Use of the software is governed by the AGPL-3.0 license and is at the sole risk of whoever runs it, subject to the laws of the user's jurisdiction.
