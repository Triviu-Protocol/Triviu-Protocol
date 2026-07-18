# 6. The Gas-Tank

The Gas-Tank is a **user safety mechanism**, not protocol revenue. It exists so
an operation is not left stuck in the block flow for want of gas.

## The purpose

When a user opens an operation and the return path would fail for lack of gas,
funds can end up stranded and orders can hang in the block flow. The Gas-Tank is
a public, verifiable reserve that guards against exactly that. It is a
gas-safety fund for the user — the protocol earns nothing here.

## Non-custodial by construction (v0)

In its current form, the Gas-Tank is a per-user escrow:

- Each account **funds its own** balance (`deposit`, or a bare transfer).
- Each account is the **only** account that can withdraw its balance.
- Withdrawals follow Checks-Effects-Interactions and are reentrancy-safe
  (verified with an adversarial reentrancy test).
- Balances and every movement are on-chain and public.

Nothing in the Gas-Tank v0 lets any account move another account's funds. It is a
transparent, user-controlled gas reserve: nothing leaves except back to the
account that deposited it.

```solidity
mapping(address => uint256) public balanceOf;   // each user's own reserve
function deposit() external payable;             // fund your reserve
function withdraw(uint256 amount) external;      // only the owner can
```

## What comes later, and why it is not here yet

The **automated consumption path** — spending a user's own reserve to complete a
stuck return leg without a second manual transaction — is a later milestone. It
touches user funds under an automated trigger, so it will be specified precisely
and audited before it ships. Until then, the Gas-Tank is the honest, minimal,
verifiable version: a reserve you control, and can always withdraw.
