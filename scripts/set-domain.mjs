#!/usr/bin/env node
/**
 * set-domain — propagate the canonical public domain to every place that hardcodes
 * it, from ONE source of truth (site/domain.config.json).
 *
 * The domain lives in SEO-critical static tags (canonical, og:url, sitemap, robots),
 * so it cannot be a runtime variable — crawlers read the raw HTML. This script makes
 * the single-source promise real: change the domain in the config, run this once, and
 * every file is rewritten consistently. Never a manual find-and-replace.
 *
 * Usage (from the repo root):
 *   node scripts/set-domain.mjs            # dry-run: report what WOULD change
 *   node scripts/set-domain.mjs --apply    # write the changes + record the new host
 *
 * Safety:
 *   - Only rewrites URLs whose host is in `knownHosts` (the Vercel hosts + any domain
 *     applied before). External hosts — including triviu-protocol.gitbook.io — are
 *     never touched.
 *   - After --apply, the new domain is added to knownHosts so the NEXT change knows
 *     what to replace.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CONFIG_PATH = join(ROOT, "site", "domain.config.json");

const APPLY = process.argv.includes("--apply");

// Directories to scan, and the file extensions that can carry a domain.
const SCAN_DIRS = ["site", "whitepaper"];
const EXTS = new Set([".html", ".xml", ".txt", ".md"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".vercel", "out", "dist"]);

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (EXTS.has(name.slice(name.lastIndexOf(".")))) acc.push(full);
  }
  return acc;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main() {
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const domain = cfg.domain;
  const knownHosts = Array.isArray(cfg.knownHosts) ? cfg.knownHosts : [];
  if (!domain) {
    console.error("domain.config.json has no `domain`. Nothing to do.");
    process.exit(1);
  }

  // Hosts to replace FROM: every known host that is not already the target.
  const fromHosts = knownHosts.filter((h) => h !== domain);
  if (fromHosts.length === 0) {
    console.log(`No source hosts to rewrite (domain already "${domain}", nothing older in knownHosts).`);
  }

  const files = SCAN_DIRS.map((d) => join(ROOT, d)).flatMap((d) => walk(d, []));
  let totalHits = 0;
  const changed = [];

  for (const file of files) {
    let text = readFileSync(file, "utf8");
    let hits = 0;
    for (const host of fromHosts) {
      // Pass 1 — scheme-qualified URLs: https://<host> at a real host boundary.
      const urlRe = new RegExp("https://" + escapeRegex(host) + "(?=[/\"'\\s<)]|$)", "g");
      text = text.replace(urlRe, () => {
        hits++;
        return "https://" + domain;
      });
      // Pass 2 — bare host mentions in visible text (e.g. "visit triviu.vercel.app").
      // Not preceded by a word char, dot or slash (so it can't sit inside a larger
      // host or a URL already handled above), and ending at a real boundary.
      const bareRe = new RegExp("(?<![\\w./])" + escapeRegex(host) + "(?=[/\"'\\s<)\\]]|$)", "g");
      text = text.replace(bareRe, () => {
        hits++;
        return domain;
      });
    }
    if (hits > 0) {
      totalHits += hits;
      changed.push([file.replace(ROOT + "\\", "").replace(ROOT + "/", ""), hits]);
      if (APPLY) writeFileSync(file, text);
    }
  }

  console.log(`Target domain: ${domain}`);
  console.log(`Replacing hosts: ${fromHosts.join(", ") || "(none)"}`);
  console.log(`${APPLY ? "APPLIED" : "DRY-RUN"} — ${totalHits} occurrence(s) in ${changed.length} file(s):`);
  for (const [f, n] of changed) console.log(`  ${n.toString().padStart(3)}  ${f}`);

  if (APPLY) {
    // Record the applied domain so future changes know to replace it.
    if (!knownHosts.includes(domain)) {
      cfg.knownHosts = [...knownHosts, domain];
      writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
      console.log(`\nRecorded "${domain}" in knownHosts.`);
    }
    console.log("\nDone. Re-run the deploy so the new domain goes live.");
  } else if (totalHits > 0) {
    console.log("\nDry-run only. Re-run with --apply to write these changes.");
  }
}

main();
