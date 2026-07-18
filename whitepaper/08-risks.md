# 8. Risks and economic limits — required reading

This chapter is part of the protocol's identity. Any distribution of Triviu that
omits it violates the spirit of the project.

## Professional competition (MEV)

Most atomic-arbitrage opportunities on Polygon are captured by professional
*searchers* with dedicated infrastructure, minimal latency and
block-production-level integrations (for example, via FastLane). An individual
operator on ordinary hardware arrives, in most cases, later — within the same
block.

## Realistic expectation — true on both sides

For most individual operators, the expected result after gas **and fee** tends
toward zero or negative. Triviu is educational and technical infrastructure — not
a source of income for the user, and it must not be presented as one by anyone,
including us.

The protocol sustains itself through the [success fee](05-success-fee.md) on the
cycles that do profit. Both statements are true at once, without contradiction:
the user is not promised a gain, and the protocol earns only where a real gain
occurs. This is the whole honesty of the fee model in one line.

## Gas and reverts

Reverted transactions still pay gas. Atomicity eliminates market exposure; it
does not eliminate cost. The success fee, by contrast, is charged only on profit
— a revert costs gas but never a fee.

## Token risk

Fee-on-transfer tokens, honeypots and manipulated liquidity exist. The Registry
whitelist mitigates; it does not eliminate. Fee-on-transfer tokens are not
supported and must not enter the whitelist.

## Contract risk

External review reduces risk; no audit brings it to zero. The known limitations
of the current contracts are documented openly — see [Section 9](09-security-and-audits.md)
and the Tradeoff Records in `/decisions`.

## Infrastructure risk

RPCs and data providers are trust points external to the protocol; users should
prefer self-hosted nodes or redundant providers.
