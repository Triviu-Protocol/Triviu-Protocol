/**
 * params.toml loader — the engine's single source of configuration.
 * Canonical parameters (routes, tokens, caps, minProfit) change via public PR
 * (CONTRIBUTING.md); your local copy of params.toml is personal and gitignored,
 * because rpc_url often embeds a provider API key.
 */
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";

export interface UniV2PoolConfig {
  kind: "univ2";
  address: `0x${string}`;
  token0: string;
  token1: string;
  decimals0: number;
  decimals1: number;
  /** Pool fee in basis points (30 = 0.30%). */
  feeBps: number;
}

export interface UniV3PoolConfig {
  kind: "univ3";
  address: `0x${string}`;
  token0: string;
  token1: string;
  decimals0: number;
  decimals1: number;
  /** Pool fee in parts-per-million, Uniswap v3 style (3000 = 0.30%). */
  feePpm: number;
}

export type PoolConfig = UniV2PoolConfig | UniV3PoolConfig;

export interface EngineParams {
  network: { chainId: number; rpcUrl: string };
  execution: {
    dryRun: boolean;
    minProfitWei: bigint;
    principalWei: bigint;
    maxSlippageBps: number;
  };
  assets: Record<string, `0x${string}`>;
  router: { univ2?: `0x${string}` };
  contracts: { executor?: `0x${string}` };
  pools: PoolConfig[];
}

function fail(message: string): never {
  throw new Error(`params.toml: ${message}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function table(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = root[key];
  if (!isRecord(v)) fail(`missing [${key}] table`);
  return v;
}

function str(t: Record<string, unknown>, key: string, where: string): string {
  const v = t[key];
  if (typeof v !== "string") fail(`${where}.${key} must be a string`);
  return v;
}

function num(t: Record<string, unknown>, key: string, where: string): number {
  const v = t[key];
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${where}.${key} must be a number`);
  return v;
}

function bool(t: Record<string, unknown>, key: string, where: string): boolean {
  const v = t[key];
  if (typeof v !== "boolean") fail(`${where}.${key} must be a boolean`);
  return v;
}

function addr(value: string, where: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) fail(`${where} is not a 40-hex-digit address: ${value}`);
  return value as `0x${string}`;
}

function weiString(t: Record<string, unknown>, key: string, where: string): bigint {
  const v = str(t, key, where);
  if (!/^\d+$/.test(v)) fail(`${where}.${key} must be a decimal string of wei`);
  return BigInt(v);
}

/** Pure parser — testable without touching the filesystem. */
export function parseParams(tomlText: string): EngineParams {
  const root = parse(tomlText) as Record<string, unknown>;

  const network = table(root, "network");
  const execution = table(root, "execution");

  const assetsRaw = isRecord(root["assets"]) ? (root["assets"] as Record<string, unknown>) : {};
  const assets: Record<string, `0x${string}`> = {};
  for (const [name, value] of Object.entries(assetsRaw)) {
    if (typeof value !== "string") fail(`assets.${name} must be an address string`);
    assets[name] = addr(value, `assets.${name}`);
  }

  const routerRaw = isRecord(root["router"]) ? (root["router"] as Record<string, unknown>) : {};
  const router: EngineParams["router"] = {};
  if (typeof routerRaw["univ2"] === "string") router.univ2 = addr(routerRaw["univ2"], "router.univ2");

  const contractsRaw = isRecord(root["contracts"]) ? (root["contracts"] as Record<string, unknown>) : {};
  const contracts: EngineParams["contracts"] = {};
  if (typeof contractsRaw["executor"] === "string" && contractsRaw["executor"] !== "") {
    contracts.executor = addr(contractsRaw["executor"], "contracts.executor");
  }

  const poolsRaw = Array.isArray(root["pools"]) ? (root["pools"] as unknown[]) : [];
  const pools: PoolConfig[] = poolsRaw.map((entry, i) => {
    if (!isRecord(entry)) fail(`pools[${i}] must be a table`);
    const where = `pools[${i}]`;
    const kind = str(entry, "kind", where);
    const base = {
      address: addr(str(entry, "address", where), `${where}.address`),
      token0: str(entry, "token0", where),
      token1: str(entry, "token1", where),
      decimals0: num(entry, "decimals0", where),
      decimals1: num(entry, "decimals1", where),
    };
    if (kind === "univ2") return { kind, ...base, feeBps: num(entry, "fee_bps", where) };
    if (kind === "univ3") return { kind, ...base, feePpm: num(entry, "fee_ppm", where) };
    return fail(`${where}.kind must be "univ2" or "univ3"`);
  });

  return {
    network: {
      chainId: num(network, "chain_id", "network"),
      rpcUrl: str(network, "rpc_url", "network"),
    },
    execution: {
      dryRun: bool(execution, "dry_run", "execution"),
      minProfitWei: weiString(execution, "min_profit_wei", "execution"),
      principalWei:
        typeof execution["principal_wei"] === "string"
          ? weiString(execution, "principal_wei", "execution")
          : 10n ** 18n, // default: 1 whole unit of an 18-decimals asset
      maxSlippageBps: num(execution, "max_slippage_bps", "execution"),
    },
    assets,
    router,
    contracts,
    pools,
  };
}

export function loadParams(path: string): EngineParams {
  return parseParams(readFileSync(path, "utf8"));
}
