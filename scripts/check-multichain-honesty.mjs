#!/usr/bin/env node
/**
 * Guardian: multi-chain honesty + no single-chain regression.
 *
 * Triviu is chain-agnostic by design (Polygon first, Arbitrum and BSC by the same
 * contracts). This guardian used to say "NOTHING is deployed on any chain yet"
 * and banned every "deployed on <chain>" phrase. That was true when it was
 * written and stopped being true on 2026-08-12.
 *
 * Measured on Polygon (chain 137) before this file changed:
 *   ParameterRegistry 0x1Adab61ef019d853BBcFaf65E929961b11897856  2511 bytes
 *   TriviuExecutor    0xEdB5Aa01fd055B3755439cE41B92b575eea1d273  5002 bytes
 *   GasTank           0xFF0Dc2fC461E28bbAC7964496535989311e93f56   777 bytes
 *   TriviuLPVault     0xC52BaD280809672D8EC5D1fcF2d7eCa45a2a423E  7954 bytes
 *   owner + treasury = Safe 0x73e344Be… · feeBps 3000 · 8 tokens whitelisted
 *   source verified on Polygonscan · https://triviu.vercel.app/dashboard/
 *
 * A guardian that enforces a claim reality has overtaken does worse than fail to
 * guard: it BLOCKS the correction. Anyone fixing the site had to write around the
 * banned phrases instead of stating the truth, and CI would have rejected the
 * honest sentence. That is what this edit repairs.
 *
 * The rules are now per chain, because the fact is per chain:
 *   POLYGON  — deployed. Saying so is required, not banned. Claiming the
 *              opposite ("nothing is deployed") is now the violation.
 *   ARBITRUM — not deployed. "live/runs/deployed on" stays banned.
 *   BSC      — not deployed. Same.
 * Single-chain EXCLUSIVITY stays banned everywhere: Polygon being the only chain
 * live today is a fact about today, not a promise about the product.
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

// Each rule: a pattern that must NOT appear, and why. `except` skips paths where the
// pattern is legitimate. The single-chain-exclusivity rules skip decisions/ because a
// Tradeoff Record is exactly where deploy scope is set (0007 locks v0.2 to one chain)
// and where expansion is documented (0004/0005/0006) — a scope decision there is honest,
// not a regression. The false-deploy-claim rules apply EVERYWHERE, decisions/ included.
const DECISIONS = /decisions[\\/]/;
const BANNED = [
  // Per chain, because the fact is per chain. Polygon dropped off these three
  // lists on 2026-08-12: it IS deployed, and banning the sentence that says so
  // was making CI enforce a falsehood.
  { re: /\b(is )?live on (arbitrum|bsc|bnb)/i, why: 'false "live on <chain>" claim (only Polygon is deployed)' },
  { re: /\bruns on (arbitrum|bsc|bnb)\b/i, why: 'false "runs on <chain>" claim (only Polygon is deployed)' },
  { re: /\bdeployed on (arbitrum|bsc|bnb)\b/i, why: 'false "deployed on <chain>" claim (only Polygon is deployed)' },

  // The inverse rule, and it is the one this file exists for now. Polygon is
  // live; a public surface saying otherwise is the violation. Kept out of
  // decisions/ because a Tradeoff Record written before the deploy is a
  // point-in-time document, not a claim about today.
  { re: /\bnothing is deployed\b/i, except: DECISIONS, why: 'FALSE: four contracts are live on Polygon (chain 137) since 2026-08-12' },
  { re: /\bno contracts (are )?deployed\b/i, except: DECISIONS, why: 'FALSE: four contracts are live on Polygon (chain 137)' },
  { re: /\bnot (yet )?deployed (on )?any(where| chain)\b/i, except: DECISIONS, why: 'FALSE: deployed on Polygon (chain 137)' },
  { re: /(polygon|arbitrum|bsc)[- ]only\b/i, except: DECISIONS, why: 'single-chain exclusivity on a user surface — expansion is on the record (0004/0005)' },
  { re: /\bonly on polygon\b/i, except: DECISIONS, why: "single-chain exclusivity regression on a user surface" },
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
      if (rule.except && rule.except.test(file)) continue;
      if (rule.re.test(line)) violations.push({ file, line: i + 1, why: rule.why, text: line.trim().slice(0, 100) });
    }
  });
}

/* ---------------------------------------------------------------------------
   REGRA POSITIVA · a chain que ESTA no livro de enderecos nao pode ser descrita
   como nao-implantada.

   POR QUE ISTO EXISTE, e a razao e um defeito medido em 2026-08-19: /chains/
   descrevia "Polygon PoS · Simulated · gate before mainnet" com SEIS contratos
   vivos na 137, e este guardiao saia 0. As 9 regras BANNED acima sao lista negra
   de FRASES, e nenhuma delas casava "Simulated · gate before mainnet". Lista
   negra so pega a frase que alguem ja imaginou; a frase nova passa sempre.

   A regra abaixo inverte o sentido: em vez de proibir frases, ela le a FONTE DA
   VERDADE — site/enderecos.js, o mesmo livro que exigirVivo() usa — e exige que
   a chain que tem endereco ali nao seja chamada de simulada em superficie
   publica. Frase nova nao escapa, porque o gatilho e o FATO, nao a palavra.

   FALHA FECHADA: livro ilegivel ou sem chainId = reprova. */
const NAO_IMPLANTADA = /\b(simulated|not deployed|nothing deployed|pending deploy|before mainnet)\b/i;
const AFIRMATIVA = /\b(deployed|live|running|em producao)\b/i;
const NOME_DA_CHAIN = { 137: /\bpolygon\b/i, 42161: /\barbitrum\b/i, 56: /\b(bnb|bsc)\b/i };

let chainViva;
try {
  const livro = readFileSync(join(ROOT, "site", "enderecos.js"), "utf8");
  const m = /CHAIN\s*=\s*(\d+)/.exec(livro);
  if (!m) throw new Error("nenhum CHAIN = <id> em site/enderecos.js");
  chainViva = Number(m[1]);
  if (!NOME_DA_CHAIN[chainViva]) throw new Error(`chain ${chainViva} sem nome mapeado nesta regra`);
} catch (e) {
  console.error("livro de enderecos ilegivel — FALHA FECHADA:", e.message);
  process.exit(1);
}

const nome = NOME_DA_CHAIN[chainViva];
for (const file of files) {
  if (DECISIONS.test(file)) continue;           // registro de ponto no tempo
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  text.split(/\r?\n/).forEach((line, i) => {
    /* Nao basta co-ocorrer na linha. "Polygon is deployed; Arbitrum is simulated"
       e uma frase VERDADEIRA e a versao anterior desta regra a reprovava — falso
       positivo medido em 2026-08-19, na propria correcao que a acompanha.
       A negativa tem de vir DEPOIS do nome da chain e sem uma afirmativa no meio. */
    const iChain = line.search(nome);
    if (iChain >= 0) {
      const depois = line.slice(iChain, iChain + 60);
      const mNeg = depois.search(NAO_IMPLANTADA);
      const mPos = depois.search(AFIRMATIVA);
      if (mNeg >= 0 && (mPos < 0 || mNeg < mPos)) {
      violations.push({
        file, line: i + 1,
        why: `chain ${chainViva} TEM endereco em site/enderecos.js e esta linha a descreve como nao-implantada`,
        text: line.trim().slice(0, 100),
      });
      }
    }
  });
}

if (violations.length) {
  console.error(`✗ multi-chain honesty: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}\n    ${v.why}\n    > ${v.text}\n`);
  process.exit(1);
}
console.log(`✓ multi-chain honesty: ${files.length} surfaces clean — no single-chain regression, no false "live" claim.`);
