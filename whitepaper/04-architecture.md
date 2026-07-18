# 4. Architecture

Triviu is four layers, and none of them holds a user's funds between
transactions.

```
Layer 1 (on-chain):   TriviuExecutor.sol + ParameterRegistry.sol + GasTank.sol
Layer 2 (off-chain):  Engine — monitor → detect → simulate → (optional) submit
Layer 3 (optional):   Flash loans via Aave v3 / Balancer Vault
Layer 4 (public):     Dashboard (Dune) + Docs
```

## 4.1 Executor contract (on-chain)

A *stateless*, verified contract. It receives the route as calldata, obtains the
capital from the caller itself (or via flash loan), executes the three legs,
applies the `minProfit` check, takes the [success fee](05-success-fee.md) on
profit, and returns principal and net result to the caller **within the same
transaction**. It keeps no balances between transactions and has no deposit
function. At no point in the system does custody of third-party funds exist.

The entire protocol reduces to one enforced condition:

```solidity
uint256 finalBalance = IERC20(asset).balanceOf(address(this));
if (finalBalance < principal + minProfit) revert UnprofitableCycle(...);
```

## 4.2 Parameter Registry (on-chain)

Stores, with versioning, the enabled route and token lists, slippage caps, the
default `minProfit`, and the fee parameters (rate and treasury). Changes go
through an owner (a timelocked multisig before mainnet), and **every change
carries the URL of its public pull request**, recorded in the emitted event — the
forum → Git → block audit trail. A parameter without a public PR does not exist,
by construction.

## 4.3 Flash loans (optional)

Integration with established Polygon providers allows execution without idle
capital of one's own. Aave v3 charges a 0.05% premium and enforces
repay-or-revert atomicity within the same transaction; Balancer's Vault currently
charges no protocol fee (a governance parameter). Gas is still paid by the
caller: if the cycle is not profitable, the transaction reverts and only the gas
is lost — and the flash-loan premium is itself part of the cost the
profitability condition ([Section 3](03-triangular-arbitrage.md)) must clear.

## 4.4 Off-chain engine (open source)

Monitors pools via multicall, detects cycles (Bellman–Ford), **simulates every
route on a local Polygon fork before any submission**, and sends transactions
signed by the user's own key, which never leaves their machine. `dry_run` is the
default; mainnet requires an explicit environment acknowledgement.

## 4.5 Simulator and backtester

A reproducible fork-and-replay environment, allowing anyone to verify — with
public data — the strategy's actual behavior before spending a single cent of
gas. The engine's cycle detector ships with worked examples anyone can run.

## 4.6 Success fee and 4.7 Gas-Tank

These two get their own chapters: the [success fee](05-success-fee.md) is how the
protocol sustains itself without custody or promises; the
[Gas-Tank](06-gas-tank.md) is a user gas-safety reserve, not protocol revenue.
