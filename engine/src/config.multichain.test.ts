/**
 * Guardian: every shipped chain config (params.*.example.toml) must be internally
 * consistent and checksum-correct. This is what caught two hand-cased pool
 * addresses whose EIP-55 checksum was wrong. It runs against the real files, so a
 * bad address, a dangling token reference, or a wrong chain id fails CI — not prod.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { loadParams, type EngineParams } from "./config.js";

const configDir = join(dirname(fileURLToPath(import.meta.url)), "..", "config");

const CHAINS = [
  { file: "params.example.toml", expectedChainId: 137, label: "Polygon (default)" },
  { file: "params.arbitrum.example.toml", expectedChainId: 42161, label: "Arbitrum One" },
  { file: "params.bsc.example.toml", expectedChainId: 56, label: "BSC" },
] as const;

function everyAddress(p: EngineParams): Array<{ where: string; value: string }> {
  const out: Array<{ where: string; value: string }> = [];
  for (const [name, a] of Object.entries(p.assets)) out.push({ where: `assets.${name}`, value: a });
  if (p.router.univ2) out.push({ where: "router.univ2", value: p.router.univ2 });
  p.pools.forEach((pool, i) => out.push({ where: `pools[${i}].address`, value: pool.address }));
  return out;
}

describe.each(CHAINS)("chain config $label", ({ file, expectedChainId }) => {
  const params = loadParams(join(configDir, file));

  it(`declares chain id ${expectedChainId}`, () => {
    expect(params.network.chainId).toBe(expectedChainId);
  });

  it("ships dry_run = true (never sends a tx by default)", () => {
    expect(params.execution.dryRun).toBe(true);
  });

  it("has every address in valid EIP-55 checksum form", () => {
    for (const { where, value } of everyAddress(params)) {
      // getAddress throws on a bad checksum and returns the canonical form otherwise.
      expect(getAddress(value), `${where} must be checksummed: ${value}`).toBe(value);
    }
  });

  it("has at least one pool, each referencing declared assets with a sane fee", () => {
    expect(params.pools.length).toBeGreaterThan(0);
    for (const [i, pool] of params.pools.entries()) {
      expect(params.assets[pool.token0], `pools[${i}].token0 "${pool.token0}" not in [assets]`).toBeDefined();
      expect(params.assets[pool.token1], `pools[${i}].token1 "${pool.token1}" not in [assets]`).toBeDefined();
      if (pool.kind === "univ2") {
        expect(pool.feeBps, `pools[${i}].fee_bps out of range`).toBeGreaterThan(0);
        expect(pool.feeBps).toBeLessThanOrEqual(100);
      }
    }
  });
});
