# 14. Roadmap

The roadmap below is the **protocol** roadmap — the on-chain, verifiable
milestones. Consistent with Principle 4, it is a statement of intent, not a
schedule commitment. There are no promised dates.

## Milestones

- **v0 — pre-mainnet.** This whitepaper, the public repository, the verified
  contracts, the off-chain engine, and the local-fork simulator. Everything is
  auditable from the code; nothing is deployed.
- **Audit gate.** A final review by the Predators Protocol audit process at the
  closing commit, with the open findings (F-01, F-02) resolved. Mainnet is gated
  on this — no exceptions.
- **v0.2 — mainnet, Polygon first.** The Executor, Registry and Gas-Tank deployed
  straight to Polygon mainnet after the audit clears. There is no separate
  public-testnet phase: the local fork is the rehearsal. The Registry moves to a
  timelocked multisig; the public dashboard goes live, failures included from day one.
- **Multi-chain, same contracts.** Because the contracts are EVM-equivalent, the
  same audited code extends to Arbitrum One and BSC by configuration — each behind
  its own deploy gate and its own Tradeoff Record ([0004](../decisions/0004-arbitrum-one.md),
  [0005](../decisions/0005-bsc.md)). No chain is "live" until its gate clears; until
  then it exists only in the simulator.
- **v1.** Registry with an active timelock, a second Predators Protocol review,
  and the complete public education material.
- **Solana — a sibling, not an extension (deferred).** Solana is not EVM; the
  contracts do not port. It is recorded as a future sibling protocol with its own
  build and audit ([0006](../decisions/0006-solana-deferred.md)), not a
  configuration of this one. It is intent, not a commitment.

## What the roadmap is not

It is not a marketing calendar and it carries no operational internals. The
sequence, the tooling and the launch mechanics of the project are managed
privately; this document commits only to what can be verified on-chain when it
ships. If a date, a return figure, or a growth promise ever appears attached to
Triviu, it did not come from this roadmap.
