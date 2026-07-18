import { describe, expect, it } from "vitest";
import { submitDecision } from "./tx.js";

const OPEN = {
  dryRun: false,
  chainId: 31337,
  simulationOk: true,
  env: { TRIVIU_PRIVATE_KEY: "0x" + "11".repeat(32) },
};

describe("submitDecision — the full truth table of 'may we send?'", () => {
  it("dry_run=true blocks everything, whatever else is set", () => {
    const d = submitDecision({ ...OPEN, dryRun: true });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("dry_run");
  });

  it("a failed simulation blocks submission", () => {
    const d = submitDecision({ ...OPEN, simulationOk: false });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("simulation");
  });

  it("mainnet without the risk acknowledgement is refused", () => {
    const d = submitDecision({ ...OPEN, chainId: 137 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("RISK NOTICE");
  });

  it("mainnet WITH the acknowledgement and every other gate open is allowed", () => {
    const d = submitDecision({
      ...OPEN,
      chainId: 137,
      env: { ...OPEN.env, TRIVIU_I_ACCEPT_THE_RISK: "yes" },
    });
    expect(d.allowed).toBe(true);
  });

  it("a missing private key blocks even a fork submission", () => {
    const d = submitDecision({ ...OPEN, env: {} });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("TRIVIU_PRIVATE_KEY");
  });

  it("fork/testnet with dry_run off, sim ok and key present is allowed", () => {
    expect(submitDecision(OPEN).allowed).toBe(true);
  });
});
