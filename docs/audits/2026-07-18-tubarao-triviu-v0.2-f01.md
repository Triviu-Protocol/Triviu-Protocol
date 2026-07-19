# Tubarão-branco · SEVERA audit — TriviuExecutor v0.2 (F-01 balance-delta)

- **Date:** 2026-07-18
- **Auditor:** Tubarão-branco (Hunter T5 · Lei do Sangue judge · Art. 13 N2)
- **On-chain vectors:** covered per Medusa scope (reentrancy, atomicity, MEV, delta)
- **Scope:** the F-01 change only — `TriviuExecutor` moves from a strict
  `startBalance == 0` stateless check to **balance-delta accounting**, plus the
  explicit `nonReentrant` guard that replaces the implicit guard the strict
  check provided. `ParameterRegistry` and `GasTank` unchanged.
- **Verdict:** **APROVA_PERFEITO** (Lei #14 BINARY) — for the F-01 delivery.
- **Not this audit:** the full external audit (§09 Cyber Squad) is the separate
  mainnet GATE, run on the complete v0.2 after F-02 (typed adapters) lands.

## Why the change was necessary

Tradeoff Record 0002 documented a donation-griefing DoS: anyone could send 1 wei
of a whitelisted token to the executor and permanently trip `NotStateless` for
that token (no sweep in v0). v0.2 measures profit as `finalBalance − startBalance`,
so a donation is preserved in place and can never block a cycle.

## The one thing that made this a Lei-do-Sangue change, not a refactor

The v0 strict check `balanceOf(this) == 0 → revert` **doubled as a reentrancy
guard** (the prior Medusa v0 audit relied on it, and the `ReenteringToken` test
proved it). Removing it without a replacement would have opened a reentrancy
hole in a fund-handling contract. v0.2 adds an explicit storage-based
`nonReentrant` guard (`_status` 1/2). Storage, not transient: `foundry.toml`
pins solc 0.8.24 with the default `shanghai` target, so `tstore` is unavailable —
a transient guard would not compile. The storage guard is portable and holds no
funds.

## Threat model — adversarial review of the diff

| Vector | Finding |
|---|---|
| Reentrancy (asset token or leg target re-enters) | **Closed.** `nonReentrant` reverts at the modifier check before any effect; no funds move in the reentrant frame. Pinned by `test_ReentrancyDuringFeeTransferIsBlocked`. |
| Balance-delta underflow (cycle loses funds) | **Safe.** Guarded by `finalBalance < startBalance + required` before any subtraction; a loss reverts `UnprofitableCycle`. |
| Donation inflates profit | **No.** `profit = delta − principal`; donation cancels in the delta. Pinned by `test_DeltaAccounting_DonationDoesNotInflateProfit`. |
| Donation stolen / caller funds retained | **No.** Exactly `delta` leaves the contract; it ends holding `startBalance`. Pinned by `test_Donation_PreservedNotStolen` and `invariant_ExecutorHoldsOnlyDonations` (128k calls, 0 violations). |
| Fee over-charge | **Capped.** `MAX_FEE_BPS = 5000` clamped in bytecode; `treasury == this` disables the fee to protect the balance invariant. |
| Arbitrary leg calldata (F-02) | **Standing, documented.** Still present; now additionally covered by the reentrancy guard against a malicious whitelisted target. Typed adapters (F-02) are the next gate before mainnet. |

## Standing observation (LOW · pre-existing · not a regression)

`require(IERC20.transfer(...))` assumes a bool return. Non-bool-returning tokens
(USDT-family) would revert the decode. Pre-existing v0 behavior, mitigated today
by whitelist curation (only standard, non-fee-on-transfer tokens are admitted).
**Disposition:** fold SafeERC20-style handling into the F-02 typed-adapter pass.
Recorded, not a blocker for F-01.

## Empirical evidence (Lei #8)

- `forge 1.5.1` local, `forge test`: **40 passed, 0 failed** (2026-07-18).
- Invariant `invariant_ExecutorHoldsOnlyDonations`: 256 runs × 500 calls =
  128 000 calls, 0 reverts; the fuzzer both donated (64 131 calls) and executed
  cycles (63 869 calls), and the executor held exactly `totalDonated` throughout.
- Fee/fuzz suite (clamp, profit-only, revert-pays-nothing) green under the new
  accounting.

## Verdict

**APROVA_PERFEITO** for the F-01 balance-delta change and its reentrancy guard.
Zero HIGH/CRITICAL. The standing items (F-02 typed adapters, SafeERC20) are
documented pre-mainnet gates, not open defects in this delivery. Nothing here
authorizes a mainnet deploy — that remains gated on F-02 and the §09 external
audit clearing the closing commit.

> *Não passa nem gota de sangue.*
