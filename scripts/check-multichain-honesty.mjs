#!/usr/bin/env node
/**
 * Guardian: multi-chain honesty + no single-chain regression.
 *
 * Triviu is chain-agnostic by design (Polygon first, Arbitrum and BSC by the same
 * contracts) but NOTHING is deployed on any chain yet. Public surfaces must say
 * that in the honest tense: "designed for / simulated / will deploy" — never
 * "runs on / live on / deployed on" a chain, and never claim single-chain
 * exclusivity now that expansion is on the record (decisions/0004, 0005).
 *
 * This scans the public, user-facing surfaces and exits non-zero on a violation,
 * so a regression fails CI instead of shipping. Run: node scripts/check-multichain-honesty.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Surfaces that make claims to users. The litepaper is explicitly marked historical
// and the audits are point-in-time records, so both are excluded.
const INCLUDE = ["site", "whitepaper", "decisions"];
const INCLUDE_FILES = ["README.md"];
const EXCLUDE = [/node_modules/, /\.vercel/, /triviu-litepaper/, /docs[\\/]audits/];
const EXT = new Set([".html", ".md", ".txt"]);

// Each rule: a pattern that must NOT appear, and why.
const BANNED = [
  { re: /\b(is )?live on (polygon|arbitrum|bsc|bnb)/i, why: 'false "live on <chain>" claim (nothing is deployed)' },
  { re: /\bruns on (polygon|arbitrum|bsc|bnb)\b/i, why: 'false "runs on <chain>" claim (use "designed for / simulated")' },
  { re: /\bdeployed on (polygon|arbitrum|bsc|bnb)\b/i, why: 'false "deployed on <chain>" claim (deploy is gated, per chain)' },
  { re: /(polygon|arbitrum|bsc)[- ]only\b/i, why: 'single-chain exclusivity — expansion is on the record (0004/0005)' },
  { re: /\bonly on polygon\b/i, why: "single-chain exclusivity regression" },
  { re: /litepaper[^.\n]{0,40}(canonical|source of truth)/i, why: "litepaper is superseded — the whitepaper is canonical" },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (EXCLUDE.some((x) => x.test(p))) continue;
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (EXT.has(extname(p))) out.push(p);
  }
  return out;
}

const files = [];
for (const d of INCLUDE) { try { files.push(...walk(join(ROOT, d))); } catch {} }
for (const f of INCLUDE_FILES) files.push(join(ROOT, f));

const violations = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of BANNED) {
      if (rule.re.test(line)) violations.push({ file, line: i + 1, why: rule.why, text: line.trim().slice(0, 100) });
    }
  });
}

if (violations.length) {
  console.error(`✗ multi-chain honesty: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}\n    ${v.why}\n    > ${v.text}\n`);
  process.exit(1);
}
console.log(`✓ multi-chain honesty: ${files.length} surfaces clean — no single-chain regression, no false "live" claim.`);
