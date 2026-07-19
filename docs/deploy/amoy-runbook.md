# Deploy runbook — fork rehearsal → mainnet

The official path is **local fork → audit → mainnet** (SECURITY.md). There is no
separate public-testnet phase; the local fork is the rehearsal, and mainnet is
gated on the Predators Protocol audit clearing the final review. The commands
below are network-agnostic — the same script deploys to a fork or to mainnet;
only the RPC and the key change.

These exact commands were rehearsed on a local Polygon fork and executed
successfully end to end (3 contracts deployed, wiring verified, fee configured
on-chain).

## Prerequisites (the operator provides)

- A deployer wallet with **Amoy test POL** (free from the Polygon faucet). No
  real funds are ever needed for testnet.
- `AMOY_RPC` — a Polygon Amoy RPC endpoint.
- Foundry installed (`forge`, `cast`).

Set them in your shell (never commit these):

```bash
export AMOY_RPC="https://rpc-amoy.polygon.technology"   # or your own endpoint
export DEPLOYER_KEY="0x..."                              # deployer private key
```

## 1. Deploy the three contracts

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $AMOY_RPC --broadcast --private-key $DEPLOYER_KEY
```

This deploys `ParameterRegistry`, then `TriviuExecutor` (pointing at the
Registry), then `GasTank`. The success fee starts **disabled** (no treasury set).
Record the three printed addresses.

## 2. Verify the wiring (read-only)

```bash
cast call $EXECUTOR "registry()(address)"      --rpc-url $AMOY_RPC   # == $REGISTRY
cast call $EXECUTOR "MAX_FEE_BPS()(uint16)"    --rpc-url $AMOY_RPC   # == 5000 (bytecode cap)
cast call $REGISTRY "owner()(address)"         --rpc-url $AMOY_RPC   # == deployer
cast call $REGISTRY "feeBps()(uint16)"         --rpc-url $AMOY_RPC   # == 0   (fee off)
cast call $REGISTRY "treasury()(address)"      --rpc-url $AMOY_RPC   # == 0x0 (fee off)
```

## 3. Verify the contracts on the Amoy explorer

```bash
forge verify-contract $EXECUTOR src/TriviuExecutor.sol:TriviuExecutor \
  --chain amoy --etherscan-api-key $POLYSCAN_KEY
forge verify-contract $REGISTRY src/ParameterRegistry.sol:ParameterRegistry \
  --chain amoy --etherscan-api-key $POLYSCAN_KEY
forge verify-contract $GASTANK  src/GasTank.sol:GasTank \
  --chain amoy --etherscan-api-key $POLYSCAN_KEY
```

## 4. (Optional) enable the success fee

Every parameter change carries the URL of its public PR — the forum→Git→block
trail. The Executor clamps `feeBps` to 50% regardless, so this can never
over-charge.

```bash
cast send $REGISTRY "setTreasury(address,string)" $TREASURY "$PR_URL" \
  --rpc-url $AMOY_RPC --private-key $DEPLOYER_KEY
cast send $REGISTRY "setFeeBps(uint16,string)" 3000 "$PR_URL" \
  --rpc-url $AMOY_RPC --private-key $DEPLOYER_KEY
```

## 5. Point the engine at the deployment

In your local `engine/config/params.toml` (gitignored):

```toml
[network]
chain_id = 80002
rpc_url = "<your Amoy RPC>"

[contracts]
executor = "<the deployed executor address>"
```

Keep `dry_run = true` until you have watched the engine simulate on Amoy.

## 6. Publish the dashboard

Fill the `dashboard/queries/*.sql` placeholders with the executor address and
the `CycleExecuted` topic, publish on Dune, and link it from the root README —
failures included from day one.

---
**Not on this runbook:** mainnet. That step waits on the external audit
(whitepaper §9 · security and audits) and the resolution of the two documented MEDIUM findings
(F-01, F-02). The engine also refuses chain 137 unless `TRIVIU_I_ACCEPT_THE_RISK=yes`.
