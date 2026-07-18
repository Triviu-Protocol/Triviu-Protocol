/**
 * Local fork simulation (v0 skeleton).
 * Project rule: NO route goes to mainnet without passing through here first.
 *
 * Typical usage (see sim/README.md):
 *   anvil --fork-url $POLYGON_RPC
 * then point params.toml's rpc_url at http://127.0.0.1:8545.
 *
 * TODO v0:
 *  - eth_call executeCycle on the fork with the assembled steps
 *  - report: estimated gas, simulated net profit, revert reason
 */
export async function simulateCycle(): Promise<{ ok: boolean; reason?: string }> {
  return { ok: false, reason: "simulator not implemented yet (v0)" };
}
