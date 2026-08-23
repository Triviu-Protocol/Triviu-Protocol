# Tradeoff Record No. 0009 — The V0 line is the product; the previous line is frozen

- **Date:** 2026-08-22
- **Status:** accepted
- **Originating PR:** ONDA-TRIVIU-RETOMADA-2026-08-22
- **Ratified by:** Tubarão-Apex, direct, in session

## Decision

**`contracts/` — the V0 line deployed on Polygon at block 92478492 — is the product.**
The previous line stays alive on chain and receives no further work; the governance
proposal that would have opened a router on it is **held, not withdrawn**.

## What made the decision necessary, measured

The two lines gate execution by opposite designs, and the difference was not
documented anywhere before this record.

| | previous line | V0 |
|---|---|---|
| routing gate | **allowlist** — `isAllowedTarget(router)`, and every target is `false` | **denylist** — `_checkRoute` in `VaultExecution.sol:422` |
| what it forbids | everything not explicitly allowed | the vault itself, the declared executor, any curated asset, any curated base currency |
| to trade | governance must open a target | nothing to open |
| fee base | `feeBps 3000` = 30% **of profit** | `feeBps 50` = 0.5% **of the traded amount**, ceiling `FEE_BPS_MAX 100` |
| user deploys | 2 contracts in 1 transaction (`TriviuVault` + `TriviuCerca`) | 3 contracts, one at a time (proxy, strategy, guard) |

Measured on chain at block 92486643, before this record was written:

```
ProtocolRegistry.paused()                    false
ProtocolRegistry.isExecutor(0x323C4192…)     true
ProtocolRegistry.isOperator(0xB3eE4676…)     true
ProtocolRegistry.isBaseCurrency(USDC)        true
VaultFactory · eth_getLogs VaultCreated      no logs over 8,151 blocks since genesis
```

**Nothing at the protocol level blocks a V0 cycle.** What is missing is the first
vault being created and configured by its owner — `setBaseCurrency`,
`setAllowedAsset`, `setStrategy`, `addGuard`, `setLimits`.

## Trilemma reading

| Axis | Verdict | Rationale and mitigation |
|---|---|---|
| Scalability | **GAINS** | The V0 needs no governance act to become transactable. On the previous line every trade waited on two Safe signatures per venue; here the owner configures their own vault and the protocol does not stand in the way. |
| Security | **HOLDS** | The V0 trades an allowlist for a denylist, which is a weaker perimeter by construction — any address may be a target. What replaces it is downstream and per-execution: the executor must be curated, a token can never be the target or spender, and `minOut`, `minTicket`, `RatioTooLow`, `GrossBelowOperatorMin`, `NetBelowStrategyMin`, the guard list and the commitment hash all sit between a bad route and the owner's funds. Weaker gate, more checks after it. Not obviously better, and stated as a trade rather than as an improvement. |
| Decentralization | **COSTS** | The previous line could not trade without the Safe acting. The V0 can, and the operator hot key `0xB3eE4676…` already holds `OPERATOR_ROLE`. Fewer hands on the switch means fewer people to stop a bad route, and the 2-of-3 Safe is no longer in the execution path — only in `setPaused`, `setFeeBps`, `setTreasury` and `setExecutor`. |

## What this costs, stated plainly

1. **Two lines now live in one product, and that does not go away.** The LP path in
   the console uses `TriviuLPVault 0xC52BaD280809672D8EC5D1fcF2d7eCa45a2a423E`, which
   is **previous line**. Choosing V0 for the arbitrage path does not move the LP path
   with it. Anyone reading "the V0 is the product" and touching the LP surface will be
   touching the other line.

2. **The guarded console guards the line that is not the product.**
   `site/js/abi-console.js` is entirely previous-line — 52 of its 64 selectors were
   verified against previous-line bytecode on 2026-08-22, and
   `scripts/check-abi-vs-chain.mjs` was written to keep proving exactly that. It works,
   and it proves the wrong thing from today. The V0 has no console in this repository.

3. **Abandoned infrastructure that still answers.** The previous `ParameterRegistry`,
   `TriviuExecutor`, `GasTank`, `TriviuRegistry` and `TriviuFactory` stay on Polygon
   with `owner()` = the Safe and `feeBps 3000`. They will never trade — zero targets,
   zero vaults, zero cycles — but they respond to every read, and they are
   indistinguishable from live infrastructure to anyone who finds them by address.

4. **The measurement that argued against the held proposal is not thereby refuted.**
   `engine/backtest/LAUDO-VARREDURAS-2026-08-11.md` measured four sweeps, 100 samples,
   **zero positive cycles**, best net **−5.36 bps**. That was our own measurement of the
   strategy, not of the line. It still stands, and it applies to the V0 as much as to
   the previous line.

## Alternatives considered

- **Open the router on the previous line and run both.** Rejected: it spends two Safe
  signatures on the line that is not the product, and the laudo above says the strategy
  it enables was measured unprofitable. The proposal is **held**, so the argument and
  the measurement inside it stay available if this reverses.
- **Withdraw the proposal.** Rejected: withdrawing deletes the identification work in it
  — `factory()`, `WETH()` and the 21,943-byte runtime were checked on chain, and a second
  candidate router was deliberately *not* allowed for want of confidence. That reasoning
  is worth keeping whether or not the call is ever made.

## Consequences

- `governance/proposals/2026-08-22-164032-allow-quickswap-v2-router.md` moves to
  **`held`**, with the reason appended and its body untouched (Elefante Art. 6,
  append-only: the record is extended, never rewritten).
- The first real exercise of the V0 is `contracts/script/cliente.sh` — nine steps, three
  deploys, rehearsed against a Polygon fork before anything is spent.
- Reversing this record means writing No. 00XX that supersedes it, not editing this one.
