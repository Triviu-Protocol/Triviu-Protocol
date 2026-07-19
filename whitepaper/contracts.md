# Contracts

The on-chain layer is three small, verified contracts. They are the same audited
Solidity across every supported EVM chain — Polygon first, Arbitrum and BSC by
configuration. **Nothing is deployed on any chain yet;** each deploys only after its
own audit gate. Read the source, don't trust this page:
[github.com/Triviu-Protocol/Triviu-Protocol](https://github.com/Triviu-Protocol/Triviu-Protocol/tree/main/contracts).

## TriviuExecutor

A **stateless**, verified contract — the whole protocol reduces to one enforced
condition. It receives the cycle as calldata, obtains the principal from the caller
(or a flash loan), runs the legs with typed swap adapters, applies the `minProfit`
check, takes the [success fee](05-success-fee.md) on profit only, and returns
principal + net result **within the same transaction**. It keeps no balances between
transactions and has no deposit function — custody of third-party funds never exists.

```solidity
uint256 finalBalance = IERC20(asset).balanceOf(address(this));
if (finalBalance < principal + minProfit) revert UnprofitableCycle(...);
```

Accounting is by **balance delta** (final − start), so fee-on-transfer and rebasing
tokens cannot inflate a phantom profit. The reentrancy guard is storage-based; swaps
use typed `Leg` adapters (UniV2 / UniV3) with SafeERC20 wrappers.

## ParameterRegistry

Stores, with versioning, the enabled route/token lists, slippage caps, the default
`minProfit`, and the fee parameters (rate + treasury). Ownership is **two-step**
(`transferOwner` → `acceptOwner`), moving to a **timelocked multisig** before mainnet.
**Every change carries the URL of its public pull request**, recorded in the emitted
event — the forum → Git → block trail. A parameter without a public PR does not exist,
by construction.

## GasTank

A non-custodial, per-user gas-safety reserve — see [Section 6](06-gas-tank.md). It is
**not** protocol revenue; withdrawal follows Checks-Effects-Interactions.

## Security posture

- **Pre-mainnet, v0, not audited by an external firm yet.** The path is
  **local fork → audit → mainnet**, per chain; there is no separate public-testnet phase.
- Audit of record: the Predators Protocol D2 laudo (Náutilo) at the v0.2 closing commit,
  with the open findings resolved — see [Security and audits](09-security-and-audits.md).
- The success fee starts **disabled** (no treasury); whitelists start **empty**. Both are
  set afterwards, each via a Registry PR that records its own URL on-chain.
- The mainnet deploy is gated: a fail-safe script refuses any non-local chain without the
  acknowledgement + a timelocked multisig owner.

## Don't trust — verify
Read the code and the tests, then run everything on a local fork where mistakes are free.
Verified on-chain addresses will be published here at each chain's mainnet deployment.
