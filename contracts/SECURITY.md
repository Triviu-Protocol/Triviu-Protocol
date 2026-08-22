# Security Policy

## What is deployed

**Live on Polygon PoS (137) since 2026-08-22, block 92478492.** Sources verified on Sourcify with
an exact bytecode match:

```
ProtocolRegistry        0x7D1D8EacA0ce96cFAb5937b88Ba5d43d7e0Ad8dC
ImplementationRegistry  0x660ca39A7fbC39dFD0ab4403ff3812519Ed4c0B0
TriviuVault (impl)      0x5F5bFe6b6019beACFa95e9778917977881A19c7B
VaultFactory            0xF4e60C6Bf2c5479935abf1A9F82554E5CD2D843c
Executor                0x323C4192b269EA56aCd147dDbd3F71056E63E835
EscapeHatch             0x877c4BC26371bD835E48db6C2B11eB715333b490
```

Governance is a 2-of-3 Safe. The deploying address renounced admin on both registries inside the
same run; `hasRole(0x00, deployer)` returns `false` on each, which you can check yourself.

**No vault holds funds yet.** `VaultFactory` is live and has not been called, so the protocol
exists and nobody has money in it. That is the state as of this writing, and it will change without
this file necessarily changing with it — read the chain.

**No external audit has been performed.** The reviews on record are internal, and that did not
change by deploying. Weigh the section below accordingly.

## Scope

In scope — the contracts under `src/`:

| Contract | |
|---|---|
| `TriviuVault` | custody, mandate, execution, positions, upgrade |
| `VaultFactory` | deterministic vault creation |
| `ProtocolRegistry` | fee, treasury, pause, operator role, base-currency and executor curation |
| `ImplementationRegistry` | catalog of adoptable implementations |
| `Executor` | runs the route and proves it kept nothing |
| `EscapeHatch` | refuge implementation |

Also in scope: the genesis and onboarding scripts under `script/`, since they decide what the
protocol looks like on day one.

Out of scope: the plugins under `script/user/ExamplePlugins.sol`, which are runnable examples and
say so; `lib/`, which is `forge-std` and OpenZeppelin upstream; and anything in `test/`.

## Known and open

Reporting these again is welcome but not news. They are recorded so a researcher does not spend
time on what is already written down.

- **A buy has three floors and only one belongs to the vault owner.** `Limits.minRatioBps` compares
  the *declared* `minOut` and never the realised amount; `operatorMinOut` is declared by whoever
  submits the execution. The one that constrains a mis-routing operator is `Intent.minOut`, from the
  owner's `Strategy`. There is no oracle in this system, by design — the floor is a number the owner
  chooses, not a price the protocol discovers.

  `ExampleStrategy` refuses a zero `MIN_OUT_PER_TICKET` at construction, and scales it to a partial
  ticket **rounded up**, so a floor that was set stays non-zero on every buy. Precise about the
  limit of that: it constrains the shipped example and nothing else. **Any `Strategy` a user writes
  can declare zero and reproduce the exposure in full**, and the vault will accept it — pinned in
  `test_aBuyWithEveryFloorAtZeroAcceptsAZeroFill`. If you are reviewing a deployment, the question
  is what its `Strategy` declares, not what the example does.
- **No external audit has been performed.** The reviews on record are internal.
- **No mainnet fork suite.** Gas and behaviour against real venues have not been measured.

## Reporting a vulnerability

**Do not open a public issue, a pull request, or a discussion.** Do not post it anywhere public
before it is fixed.

Use **GitHub's private vulnerability reporting** on this repository: the *Security* tab →
*Report a vulnerability*. It is private between you and the maintainers, and it needs no email
address from either side.

> **Maintainer note, and this file is not honest until it is done:** private vulnerability reporting
> is off by default. Enable it under *Settings → Code security → Private vulnerability reporting*.
> Until it is on, the *Report a vulnerability* button does not exist and this section points at
> nothing. The repository must also be published first — at the time of writing it has no remote.

Please include: which contract and function, what an attacker gains, the preconditions they need,
and a Foundry test that reproduces it if you have one. A failing test is worth more than a
paragraph.

### What to expect

We will acknowledge that we received it, tell you our assessment of severity and whether we agree
with yours, and tell you when it is fixed. We will not tell you a date we cannot keep.

**There is no bug bounty.** No payment is offered, promised, or implied. If that changes it will be
written here, and only here — a statement anywhere else is not a commitment by this project.

Credit in the fix commit and the changelog if you want it, and silence if you prefer.

## Safe harbour

Research within this policy is authorised, and we will not pursue legal action for it. The
authorisation covers work that is:

- **Local or on a public testnet.** Deploy your own instance from this repository — the whole
  genesis runs in one command. Since nothing of this codebase is on a public mainnet, there is
  nothing there to test against, and this policy does not authorise you to attack anything you find
  elsewhere that resembles it.
- **Against your own funds and your own contracts.** Never against another person's vault or assets.
- **Non-destructive.** No denial of service, no spam, no social engineering of anyone involved, no
  attempt to reach infrastructure, accounts, or data belonging to us or to third parties.
- **Reported privately and given time to be fixed** before you discuss it publicly.

Work outside those bounds is outside this authorisation. This policy grants permission from **this
project only**: it cannot and does not authorise anything against a third party's systems, and it
does not override the law of any jurisdiction that applies to you. If a step seems to fall outside,
ask first through the private channel — asking is free and it protects both of us.

## Governance and the keys

`ProtocolRegistry` and `ImplementationRegistry` are administered by a governance address set at
genesis, which is separate from both the deployer and the operator; the deployer renounces admin in
the same run that creates them. The operator key is hot and, by design, cannot withdraw, choose
assets, change configuration, or hand a route's input to an uncurated executor.

If a key is compromised rather than the code, that is still a report we want, through the same
channel.
