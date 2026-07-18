# On-chain re-audit — Triviu success fee + GasTank

- **Auditor:** Medusa (Predators Protocol · Web3 on-chain audit) · internal
- **Date:** 2026-07-18
- **Scope:** the DELTA over the v0 audit — the success fee in
  `TriviuExecutor.sol` / `ParameterRegistry.sol`, and the new `GasTank.sol`.
  The unchanged core is covered by [the v0 report](2026-07-18-medusa-triviu-v0.md);
  Article 6 requires a fresh audit for changed code, which this is.
- **Solidity:** `^0.8.24` · Foundry (forge 1.5.1)

> Internal audit. The external third-party audit remains a hard mainnet gate
> (litepaper §10). This raises the floor on the fee change; it does not clear
> mainnet.

## 1. What was examined (this delta)

| Technique | Result |
|---|---|
| Manual review of the fee path and GasTank | done, line by line |
| Unit + fee-specific tests (`forge test`) | 39/39 pass (was 19; +20 for fee/GasTank) |
| Invariant with fee ACTIVE | `invariant_ContractBalanceAlwaysZero` — 256×500 calls, 0 violations |
| Reentrancy — fee transfer (hook token) | empirically blocked; `test_ReentrancyDuringFeeTransferIsBlocked` |
| Reentrancy — GasTank withdraw | empirically safe; `test_ReentrancyCannotDoubleSpend` |
| Fuzz — fee ≤ ½ profit under any bps | `testFuzz_FeeNeverExceedsHalfProfit_AndExecutorEndsEmpty` |

## 2. Findings

### CRITICAL — none · HIGH — none

### FEE-01 · Treasury misconfiguration (treasury == executor) — LOW (fixed)

If the owner set the treasury to the executor's own address, the fee would be
stranded in the contract and permanently trip the stateless check (self-DoS).
**Fixed during this wave:** the executor skips the fee when
`treasury == address(this)`, routing the whole result to the caller instead of
trapping funds. Pinned by `test_Fee_SkippedWhenTreasuryIsExecutorItself`.

### FEE-02 · Fee rate is owner-controlled — INFO (mitigated by design)

The rate lives in the Registry (deployer-owned now, timelocked multisig before
mainnet). A user must trust it is set fairly. Mitigations, all on-chain: the
executor clamps to `MAX_FEE_BPS = 5000` (50%) in bytecode, every change carries
a PR URL, and every cycle emits the exact fee. Recorded in
`decisions/0003-success-fee.md`.

### GASTANK-01 · Automated consumption path not implemented — INFO (by design)

`GasTank` v0 is a user-controlled escrow: each account funds and withdraws its
own balance (pull-payment, CEI, reentrancy-safe). The automated path — spending
a user's reserve to complete a stuck return leg — does **not exist yet** and is
therefore out of scope here; it will get its own audit when specified. Nothing
in v0 lets any account move another account's funds.

## 3. Positive observations (verified)

- **The stateless check doubles as a reentrancy guard.** A hook token that
  reenters `executeCycle` during the fee transfer is rejected with `NotStateless`
  (the contract still holds the caller's funds mid-cycle). Verified empirically,
  not argued.
- **Fee is profit-only, atomic and clamped.** Charged solely on realized profit
  above gas, routed in the same transaction, never above 50% — the executor ends
  every transaction empty, fee active or not (invariant, 128k calls).
- **Success-only, provably.** Reverts and break-even cycles pay nothing — the fee
  code is unreachable on those paths.
- **No new custody.** The fee lands in the treasury and the GasTank holds only
  each user's own deposits; the non-custody claim survives intact.

## 4. Carryover from the v0 audit (unchanged)

F-01 (donation griefing) and F-02 (arbitrary calldata to whitelisted targets)
are unaffected by this change and remain as documented — mainnet gates, not
testnet blockers.

## 5. Verdict

| Severity | Count | Blocks testnet? | Blocks mainnet? |
|---|---|---|---|
| CRITICAL / HIGH | 0 | — | — |
| LOW | 1 (FEE-01, fixed) | No | No |
| INFO | 2 (FEE-02, GASTANK-01) | No | No |

**Medusa verdict for the fee + GasTank delta (fork/testnet scope): APPROVED.**
No CRITICAL or HIGH. The one LOW was fixed in-wave; the INFO items are
by-design and documented. Article 5 (imutável) honored: nothing with a known
unmitigated vulnerability is approved. Mainnet remains gated on F-01/F-02 and the
external audit — unchanged by this delta. New code = new audit: this covers
exactly the fee and GasTank at this commit.
