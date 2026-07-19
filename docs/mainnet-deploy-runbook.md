# Mainnet deploy runbook (§10)

The official path is **local fork → audit → mainnet** — no separate public
testnet (whitepaper §9/§14). This runbook is the checklist that turns a GO into a
one-command deploy. Nothing here is executed by the pack; the founder authorizes,
and the Leão runs the deploy.

## 0 · Pre-deploy gates — do NOT deploy until EVERY box is true

- [ ] **D2 audit cleared.** Predators Protocol laudo sealed
      (`docs/audits/2026-07-18-nautilo-d2-laudo-v0.2.md`, Tubarão N2 APROVA_PERFEITO).
- [ ] **Bug bounty (optional).** The D2 laudo is the audit of record; a public
      bug bounty (`SECURITY.md`) is available at the founder's discretion as
      ongoing crowd-sourced review — not a blocking gate.
- [ ] **Owner multisig ready.** A timelocked multisig address exists
      (`TRIVIU_OWNER_MULTISIG`). Deploying to a bare EOA is forbidden on mainnet
      (the script reverts).
- [ ] **Token whitelist policy finalized.** The intended token/target set is
      decided, and it EXCLUDES fee-on-transfer / rebasing tokens (audit M-2).
- [ ] **Deploy wallet funded** with POL for gas; key held off-repo.
- [ ] **Founder GO** — explicit.

## 1 · Deploy (Leão · one command)

```bash
export TRIVIU_OWNER_MULTISIG=0x...            # timelocked multisig
export TRIVIU_MAINNET_ACK=audit-and-trust-gates-done
export DEPLOYER_KEY=...                        # off-repo, never logged
forge script script/Deploy.s.sol \
  --rpc-url $POLYGON_RPC --broadcast --verify --private-key $DEPLOYER_KEY
```

The script deploys Registry → Executor → GasTank, STARTS the two-step owner
handoff to the multisig, and prints the three addresses. The success fee starts
DISABLED (no treasury); whitelists start EMPTY.

## 2 · Post-deploy (finish the trust gates)

- [ ] **Finish the owner handoff.** The multisig calls `registry.acceptOwner()`.
      Confirm `registry.owner() == multisig` and `registry.pendingOwner() == 0`.
- [ ] **Set whitelists via Registry PRs.** Each `setToken`/`setTarget` records its
      PR URL on-chain (forum → Git → block). Add only the vetted token/router set.
- [ ] **Verify all three contracts on Polygonscan** (`--verify` needs
      `ETHERSCAN_API_KEY` set to a Polygonscan key; confirm the green checkmark and
      matching bytecode).
- [ ] **Fee stays off** until a deliberate `setTreasury` + `setFeeBps` PR.

## 3 · Wire the public surfaces

- [ ] Dashboard: set the Executor address + `CycleExecuted` topic in
      `dashboard/queries/*` and publish the Dune board; link it from the site.
- [ ] Site "verify" table (§07): fill the Polygonscan addresses row.

## 4 · Final verification (before announcing)

- [ ] `registry.owner()` is the multisig; `feeBps`/`treasury` are the intended values.
- [ ] The whitelist matches the intended set exactly (no stray target).
- [ ] The public dashboard reads real on-chain data, reverts included.

## Rollback note

The contracts are stateless (they hold no user funds between transactions), so a
bad deploy is cheap to abandon: stop directing traffic at the old Executor and
deploy a corrected one. Users never had funds in the contract to rescue — the
non-custody property IS the rollback story.
