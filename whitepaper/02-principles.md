# 2. Principles

Seven principles govern every decision in Triviu — technical, visual and
editorial. They are ordered by priority; when two conflict, the lower number
wins.

1. **Absolute non-custody.** The protocol never holds third-party funds. Every
   execution happens inside a single transaction, with principal and net result
   returning to the caller. The [success fee](05-success-fee.md) is taken inside
   that same transaction — the contract keeps no balance afterwards. This is
   proven, not asserted: an on-chain invariant test drives 128,000 calls and the
   executor's balance is zero after every one.
2. **Open source.** Public repository under AGPL-3.0, signed releases, open CI.
3. **Radical transparency.** Verified contracts, a public execution dashboard
   (failures included), parameters with full Git history, and a fee taken
   on-chain and emitted on every cycle.
4. **No promises.** No return projections, in any material. Possibility is not
   probability — and [Section 8](08-risks.md) documents why. A fee charged on a
   result is the opposite of a promise — but "the result" is not the same thing
   on both of Triviu's paths, and saying otherwise would be a projection by
   omission. On the **arbitrage cycle**, the protocol earns only when the user
   does, enforced by the contract's own balance check. On **liquidity
   provision**, the fee is a share of the fees a position *collected*, and
   collected fees are not the owner's result: impermanent loss and recentering
   are subtracted afterwards, so a position can pay the fee and still end below
   what went into it. [Section 5](05-success-fee.md) states both, with the
   number we measured.
5. **No token.** Triviu has no token, presale, allocation or yield program, and
   none is planned.
6. **Education before execution.** The default user path goes through a local
   fork before any mainnet transaction.
7. **Labeled AI.** Any AI-generated content is identified as such, on every
   channel and in every piece — transparency about synthetic content is a rule,
   not a courtesy.

## The immutable rules

Three of these are treated as **immutable governance rules** — they cannot change
in any phase without ceasing to be Triviu: **no token**, **no custody**, **no
promise**. Everything else in this document derives from them. A change to any of
the three is not a new version of Triviu; it is a different product.
