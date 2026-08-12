#!/usr/bin/env node
/**
 * Guardian: site/enderecos.js is a COPY, and copies drift.
 *
 * The canonical ledger is contracts/deploy/enderecos.js. It cannot be served to
 * the site: the published web root is `site/`, so `../../contracts/...` resolves
 * ABOVE the root and returns 404 — measured on https://triviu.vercel.app.
 *
 * The file itself says duplicating an address across two files is an acceptance
 * failure, and that stays true. What makes this copy legitimate rather than a
 * second source is THIS check: byte-for-byte, failing CI the moment they differ.
 * A copy without a drift alarm is how two addresses start disagreeing quietly.
 *
 *   node scripts/check-enderecos-drift.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const FONTE = join(ROOT, "contracts", "deploy", "enderecos.js");
const COPIA = join(ROOT, "site", "enderecos.js");

const h = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

let a, b;
try { a = h(FONTE); } catch { console.error(`✗ fonte ausente: ${FONTE}`); process.exit(1); }
try { b = h(COPIA); } catch {
  console.error(`✗ copia ausente: ${COPIA}`);
  console.error(`  gere com: cp contracts/deploy/enderecos.js site/enderecos.js`);
  process.exit(1);
}

if (a !== b) {
  console.error("✗ enderecos.js DIVERGIU entre a fonte e a copia servida");
  console.error(`  contracts/deploy/enderecos.js  sha256 ${a.slice(0, 16)}…`);
  console.error(`  site/enderecos.js              sha256 ${b.slice(0, 16)}…`);
  console.error("  A pagina publica leria enderecos diferentes do livro-razao.");
  console.error("  Corrija com: cp contracts/deploy/enderecos.js site/enderecos.js");
  process.exit(1);
}
console.log(`✓ enderecos.js: fonte e copia identicas (sha256 ${a.slice(0, 16)}…)`);
