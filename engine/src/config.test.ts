import { describe, expect, it } from "vitest";
import { parseParams } from "./config.js";

const GOOD = `
[network]
chain_id = 31337
rpc_url = "http://127.0.0.1:8545"

[execution]
dry_run = true
min_profit_wei = "3100000000000000"
principal_wei = "1000000000000000000"
max_slippage_bps = 30

[assets]
wmatic = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"
usdce  = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"

[router]
univ2 = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"

[contracts]
executor = ""

[[pools]]
kind = "univ2"
address = "0x6e7a5FAFcec6BB1e78bAE2A1F0B612012BF14827"
token0 = "wmatic"
token1 = "usdce"
decimals0 = 18
decimals1 = 6
fee_bps = 30
`;

describe("parseParams", () => {
  it("parses the canonical shape into typed values", () => {
    const p = parseParams(GOOD);
    expect(p.network.chainId).toBe(31337);
    expect(p.execution.dryRun).toBe(true);
    expect(p.execution.minProfitWei).toBe(3_100_000_000_000_000n);
    expect(p.execution.principalWei).toBe(10n ** 18n);
    expect(p.assets["wmatic"]).toBe("0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270");
    expect(p.router.univ2).toBe("0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff");
    expect(p.contracts.executor).toBeUndefined(); // empty string = not configured
    expect(p.pools).toHaveLength(1);
    expect(p.pools[0]).toMatchObject({ kind: "univ2", feeBps: 30, decimals1: 6 });
  });

  it("defaults principal_wei to 1e18 when absent", () => {
    const p = parseParams(GOOD.replace(/principal_wei.*\n/, ""));
    expect(p.execution.principalWei).toBe(10n ** 18n);
  });

  it("rejects malformed addresses with a precise message", () => {
    expect(() => parseParams(GOOD.replace(/0x0d500B[0-9a-fA-F]+/, "0xNOPE"))).toThrow(
      /assets\.wmatic/
    );
  });

  it("rejects a pool of unknown kind", () => {
    expect(() => parseParams(GOOD.replace('kind = "univ2"', 'kind = "univ4"'))).toThrow(
      /pools\[0\]\.kind/
    );
  });

  it("rejects non-decimal wei strings", () => {
    expect(() => parseParams(GOOD.replace('"3100000000000000"', '"3.1e15"'))).toThrow(
      /min_profit_wei/
    );
  });
});
