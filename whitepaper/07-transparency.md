# 7. Operational transparency

Transparency is Triviu's foremost virtue — it is the primitive the blockchain
itself is built on. Everything the protocol does leaves a public, verifiable
trace.

- **Verified contracts.** The Executor, Registry and Gas-Tank are verified on the
  block explorer; anyone reads the exact deployed bytecode.
- **Public dashboard, failures included.** A Dune dashboard publishes every
  execution, the aggregate figures, the revert rate and the fee taken — reverts
  counted as first-class data. A metric without its failure context is marketing;
  a metric with failures included is evidence.
- **Parameter trail.** Public PR → open discussion → merge → on-chain update, and
  the on-chain event records the PR URL. The trail from forum to block is
  complete and unbroken.
- **Open engine and simulator.** The off-chain code is public and runnable; the
  cycle detector ships with worked examples.
- **Public audit reports.** The audits (Section 9) live in the repository, name
  their auditor, and state what was and was not examined.

The rule behind all of it: *if it cannot be verified, it does not ship as a
claim.* Where Triviu cannot prove something, it says so — which is the subject of
the next two chapters.
