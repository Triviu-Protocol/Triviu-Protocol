#!/usr/bin/env node
/**
 * Guardian: os tres gates que o Tubarao-branco cravou para qualquer pagina que
 * peca assinatura de carteira (ONDA-F1, bloco eb7bf221).
 *
 *   1. CSP declarada, com script-src do proprio dominio
 *   2. three.js do proprio dominio OU com integrity (SRI)
 *   3. a pagina que assina nao compartilha origem com pagina que carrega terceiro
 *
 * Por que um guardiao e nao um commit: os tres gates nao sao um estado, sao uma
 * invariante. O header pode ser cravado hoje e a proxima pagina reintroduzir um
 * <script> inline — e ai o CSP nao afrouxa, a pagina simplesmente para de
 * funcionar; ou pior, alguem afrouxa o CSP para a pagina voltar a funcionar, e a
 * origem que assina volta a aceitar script injetado. As duas saidas sao ruins e
 * as duas sao silenciosas. Este check torna as duas barulhentas.
 *
 * Nota sobre hash de script inline: foi considerado e DESCARTADO. O repo esta em
 * core.autocrlf=true e as blobs tem line endings mistos — medido 2026-08-12,
 * site/index.html tinha 2627 linhas com CR na blob e 3116 na worktree. Hash
 * sha256 calculado na worktree NAO bate com o byte que a Vercel serve a partir da
 * blob. Um CSP baseado em hash passaria local e quebraria so em producao. Por
 * isso os blocos inline foram extraidos para /js/*.js e o script-src e 'self'
 * puro: sem byte para bater, sem armadilha de line ending.
 *
 *   node scripts/check-csp.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";
import {
  blocos, casa, diretivasDe, hashCsp, podeAssinar, politicaDaRota, rotaDoArquivo,
  retidos, naoPublica,
} from "./csp-por-rota.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SITE = join(ROOT, "site");

/* three.js r128, conferido em 2026-08-12 contra o SRI que o proprio cdnjs
   publica em api.cdnjs.com/libraries/three.js/r128?fields=sri — endpoint
   diferente do que serviu o arquivo, entao e conferencia cruzada e nao eco. */
const VENDOR = {
  "vendor/three-r128.min.js":
    "dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==",
};

const falhas = [];
const notas = [];
const falhar = (m) => falhas.push(m);
const RETIDOS = retidos(ROOT);
let naoJulgadas = 0;

/* ------------------------------------------------------------ vercel.json -- */
let cfg;
const CAMINHO_CFG = join(ROOT, "vercel.json");
try {
  cfg = JSON.parse(readFileSync(CAMINHO_CFG, "utf8"));
} catch (e) {
  console.error(`✗ vercel.json nao e JSON valido: ${e.message}`);
  console.error("  Sem parse, a Vercel ignora o arquivo inteiro e o site vai ao ar SEM CSP.");
  process.exit(1);
}

const regra = (cfg.headers || []).find((h) => h.source === "/(.*)");
if (!regra) falhar("vercel.json: nenhuma regra de header em '/(.*)' — o CSP nao cobriria o site inteiro");

const cabecalho = (nome) =>
  regra && (regra.headers || []).find((h) => h.key.toLowerCase() === nome.toLowerCase());

const csp = cabecalho("Content-Security-Policy");
if (!csp) falhar("vercel.json: Content-Security-Policy ausente — GATE 1 nao existe");

/** "script-src 'self'; img-src 'self' data:" -> { "script-src": ["'self'"], … } */
const diretivas = {};
if (csp) {
  for (const parte of csp.value.split(";")) {
    const t = parte.trim().split(/\s+/).filter(Boolean);
    if (t.length) diretivas[t[0].toLowerCase()] = t.slice(1);
  }
}

/* --------------------------------------------------------------- GATE 1 --- */
const scriptSrc = diretivas["script-src"];
if (!scriptSrc) {
  falhar("CSP sem script-src — a diretiva que o gate 1 exige nomeadamente");
} else {
  for (const proibido of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "*", "data:", "https:", "http:"]) {
    if (scriptSrc.includes(proibido))
      falhar(`CSP script-src contem ${proibido} — script-src deixa de ser "do proprio dominio"`);
  }
  const externos = scriptSrc.filter((f) => /^(https?:)?\/\//.test(f));
  if (externos.length) falhar(`CSP script-src permite origem de terceiro: ${externos.join(" ")}`);
  if (!scriptSrc.includes("'self'")) falhar("CSP script-src nao contem 'self'");
}

/* worker-src 'none' e o que impede que um script injetado registre um service
   worker e passe a interceptar TODA pagina desta origem, inclusive a que assina.
   Medido 2026-08-12: nenhuma pagina do site usa worker. Custa zero, fecha muito. */
if (diretivas["worker-src"]?.[0] !== "'none'")
  falhar("CSP sem worker-src 'none' — um script injetado poderia registrar service worker e persistir na origem");

for (const [dir, esperado] of [
  ["object-src", "'none'"],
  ["base-uri", "'none'"],
  ["frame-ancestors", "'none'"],
]) {
  if (diretivas[dir]?.[0] !== esperado) falhar(`CSP sem ${dir} ${esperado}`);
}

for (const h of ["Cross-Origin-Opener-Policy", "X-Content-Type-Options", "Referrer-Policy"]) {
  if (!cabecalho(h)) falhar(`header ${h} ausente`);
}

/* ------------------------------------------- GATE 1 nas OUTRAS politicas --- *
 * O bloco acima julga `/(.*)`. Ele era a CSP inteira ate 2026-09-07; hoje sao
 * 17 blocos, e um portao que julgue so o primeiro fica VERDE sobre 16 que nunca
 * olhou. As demais politicas passam por uma versao CONDICIONAL da mesma regra:
 *
 *   - `'unsafe-inline'` de SCRIPT continua proibido em toda politica, sem
 *     excecao. Ele autoriza qualquer script inline, inclusive o injetado.
 *   - `'unsafe-eval'`, `'unsafe-hashes'` e `'strict-dynamic'` sao permitidos
 *     APENAS em rota cujas paginas nao alcancam carteira. Onde ha assinatura,
 *     valem as mesmas proibicoes de sempre.
 *   - host de terceiro em script-src continua proibido em toda politica.
 *   - as diretivas de fechamento (`object-src`, `base-uri`, `frame-ancestors`,
 *     `worker-src`) valem em toda politica.
 *
 * Quem decide "pode assinar" nao e o nome da rota: e alcancar um provedor
 * EIP-1193, medido no HTML e nos .js que ele carrega. */
{
  const paginasPorRota = new Map();
  (function andar(d) {
    for (const nome of readdirSync(d)) {
      const p = join(d, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (nome.endsWith(".html")) {
        const relSite = relative(SITE, p).split(sep).join("/");
        /* Retida pelo .vercelignore nao entra: politica so vale para o que
           chega a producao, e contar a retida faz um bloco parecer usado
           quando nao e — e faz a retida aparecer como falha que nao existe. */
        if (naoPublica(RETIDOS, relSite)) continue;
        paginasPorRota.set(rotaDoArquivo(relSite), p);
      }
    }
  })(SITE);

  for (const b of blocos(cfg)) {
    if (!b.csp || b.source === "/(.*)") continue;
    const d = diretivasDe(b.csp);
    const ss = d["script-src"] || [];

    /* quais paginas esta politica realmente serve, e alguma assina? */
    const servidas = [...paginasPorRota.entries()].filter(([rota]) => casa(b.source, rota));
    let assina = null;
    for (const [, arq] of servidas) {
      const r = podeAssinar(readFileSync(arq, "utf8"), arq, SITE);
      if (r.assina) { assina = r.provas.join(", "); break; }
    }

    if (ss.includes("'unsafe-inline'"))
      falhar(`${b.source}: script-src com 'unsafe-inline' — autoriza QUALQUER script inline, ` +
        "inclusive o injetado. Nao ha rota em que isso seja aceitavel.");

    for (const perigoso of ["'unsafe-eval'", "'unsafe-hashes'", "'strict-dynamic'"])
      if (ss.includes(perigoso) && assina)
        falhar(`${b.source}: script-src com ${perigoso} numa rota que PODE ASSINAR (${assina}) — ` +
          "afrouxamento so passa onde nao ha assinatura.");

    const externos = ss.filter((f) => /^(https?:)?\/\//.test(f));
    if (externos.length) falhar(`${b.source}: script-src permite origem de terceiro: ${externos.join(" ")}`);

    /* Com 'strict-dynamic' o `'self'` e IGNORADO pelo navegador — exigi-lo ali
       seria cobrar um token morto. Sem ele, `'self'` continua obrigatorio. */
    if (!ss.includes("'strict-dynamic'") && !ss.includes("'self'"))
      falhar(`${b.source}: script-src nao contem 'self'`);

    for (const [dir, esperado] of [["object-src", "'none'"], ["base-uri", "'none'"],
                                   ["frame-ancestors", "'none'"], ["worker-src", "'none'"]])
      if (d[dir]?.[0] !== esperado) falhar(`${b.source}: sem ${dir} ${esperado}`);

    /* Bloco que nao serve nenhuma pagina HOJE tem duas naturezas, e trata-las
       igual seria impreciso nos dois sentidos:

       a) GEMEO DECLARADO — `/x.html` quando `/x/` e servida. Sob `cleanUrls` o
          `.html` sempre devolve 308 e o header dele nao chega a ninguem; medido
          nas 27 rotas do preview dpl_HnyeuwfUdgPC9vmudLhtJ5zFHcQE. Nao e
          protecao no papel: e a MESMA politica presa no outro nome, para o dia
          em que `cleanUrls` for desligado e `/x.html` passar a servir. Nota.

       b) ORFAO — bloco que nao casa com nenhuma pagina e nem com o gemeo de uma.
          Ai alguem esta protegido no papel: a pagina sumiu, ou a rota foi
          digitada errada e a politica nunca chega. Reprova. */
    if (servidas.length === 0) {
      /* `index.html` nao vira `/index`: vira o diretorio. `/index.html` e gemeo
         de `/`, e `/a/index.html` e gemeo de `/a/`. */
      const semHtml = b.source.replace(/\.html$/, "");
      const gemeo = b.source.endsWith(".html")
        && [...paginasPorRota.keys()].some((r) =>
          r === semHtml || r === semHtml + "/" || r === semHtml.replace(/index$/, ""));
      /* Rota que REDIRECIONA e a mesma natureza do gemeo: a resposta e um 308 e
         o header dela nao alcanca ninguem. Apareceu quando `/labs/`, `/brand/` e
         `/design-system/` viraram redirecionamento para o nome canonico — o
         bloco continuou correto e passou a ser inalcancavel. */
      const redireciona = (cfg.redirects || []).some(
        (r) => !r.has && (r.source === b.source || r.source === b.source.replace(/\/$/, "")));
      if (redireciona) {
        notas.push(`${b.source}: rota que redireciona — devolve 308, o header nao chega a ninguem`);
        continue;
      }
      if (gemeo) notas.push(`${b.source}: gemeo de rota servida — sob cleanUrls devolve 308, header nao chega a ninguem`);
      else falhar(`${b.source}: bloco de header ORFAO, nao serve nenhuma pagina nem e gemeo de uma — ` +
        "ou a rota esta errada, ou a pagina sumiu; nos dois casos alguem esta protegido no papel e nao no ar.");
    }
  }
}

/* ------------------------------------------------------ varredura do site -- */
const htmls = [];
(function andar(d) {
  for (const nome of readdirSync(d)) {
    const p = join(d, nome);
    if (statSync(p).isDirectory()) andar(p);
    else if (nome.endsWith(".html")) htmls.push(p);
  }
})(SITE);

const TAG_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const atr = (s, nome) => s.match(new RegExp(`${nome}\\s*=\\s*"([^"]*)"`, "i"))?.[1];

const hostsSubrecurso = new Set();

/* Tipos que o navegador EXECUTA. Qualquer outro type e ilha de dados: o
   navegador nao o "prepara" para execucao, entao o script-src nao o avalia, e
   contar ilha de dados como script inline e alarme falso. `application/ld+json`
   ja era tratado assim; `__bundler/manifest`, `__bundler/template` e
   `text/x-dc` sao a mesma coisa — JSON e fonte que um runtime LE com
   querySelector, nao codigo que o parser roda. */
const EXECUTAVEL = new Set(["", "text/javascript", "application/javascript", "module"]);

for (const arquivo of htmls) {
  const rel = relative(SITE, arquivo).split(sep).join("/");
  if (naoPublica(RETIDOS, rel)) { naoJulgadas += 1; continue; }
  const html = readFileSync(arquivo, "utf8");
  const rota = rotaDoArquivo(rel);
  const pol = politicaDaRota(cfg, rota);
  if (!pol) { falhar(`${rel}: rota ${rota} nao casa com nenhum bloco de header — falha fechada`); continue; }
  const dPag = diretivasDe(pol.csp);
  const ssPag = dPag["script-src"] || [];
  const hashesPag = new Set(ssPag.filter((f) => f.startsWith("'sha")));
  const permiteHandler = ssPag.includes("'unsafe-hashes'");

  for (const m of html.matchAll(TAG_SCRIPT)) {
    const atributos = m[1];
    const src = atr(atributos, "src");

    if (!src) {
      const tipo = (atr(atributos, "type") || "").toLowerCase();
      if (!EXECUTAVEL.has(tipo)) continue;
      /* Executavel e inline: so passa se a politica DESTA rota o autorizar pelo
         conteudo. Hash e o oposto de 'unsafe-inline' — autoriza este bloco, e
         um byte diferente ja e outro bloco. */
      if (hashesPag.has(hashCsp(m[2]))) continue;
      falhar(`${rel}: <script> inline (type="${tipo || "javascript"}") que a CSP de ${rota} RECUSA — ` +
        "extraia para /js/*.js, ou autorize o bloco por hash sha256 no vercel.json");
      continue;
    }

    if (/^(https?:)?\/\//.test(src)) {
      const host = new URL(src.startsWith("//") ? "https:" + src : src).host;
      hostsSubrecurso.add(host);
      /* GATE 2 + GATE 3: script de terceiro so passa com SRI — e mesmo com SRI
         ele continua sendo terceiro executando nesta origem, que e exatamente o
         que o gate 3 nao quer ao lado de uma pagina que assina. */
      if (!atr(atributos, "integrity"))
        falhar(`${rel}: <script src="${src}"> de terceiro SEM integrity — GATE 2`);
      else
        falhar(`${rel}: <script src="${src}"> e terceiro nesta origem — com SRI, mas GATE 3 pede a origem limpa`);
    }
  }

  /* Handler em atributo e script inline com outro nome. Sob script-src 'self'
     ele nao roda, e a falha e SILENCIOSA: o botao fica na tela, bonito, e nao
     responde. Foi assim que 12 `onclick` do Console quase foram ao ar mortos —
     a medicao no navegador nao pegou porque media o que CARREGA, e handler so
     aparece quando alguem clica. Quem pegou foi este portao.
     CSP3 autoriza handler por hash, e so com 'unsafe-hashes' na diretiva. */
  for (const m of html.matchAll(/\son(?:click|load|error|change|input|submit|focus|blur|keydown|keyup|mouse[a-z]+)\s*=\s*"([^"]*)"/gi)) {
    const evento = m[0].trim().replace(/\s*=.*/s, "");
    if (permiteHandler && hashesPag.has(hashCsp(m[1]))) continue;
    falhar(`${rel}: handler inline (${evento}) que a CSP de ${rota} RECUSA — ` +
      (permiteHandler
        ? "o valor nao esta entre os hashes autorizados"
        : "sem 'unsafe-hashes' + hash do valor, ele nao executa e o botao nao responde"));
  }

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel_ = (atr(m[0], "rel") || "").toLowerCase();
    const href = atr(m[0], "href");
    if (!href || !/^(https?:)?\/\//.test(href)) continue;
    if (rel_.includes("stylesheet") || rel_ === "icon" || rel_.includes("preload"))
      hostsSubrecurso.add(`${new URL(href.startsWith("//") ? "https:" + href : href).host} ${rota}`);
  }
}

/* Todo host de subrecurso tem de estar declarado em ALGUMA diretiva do CSP.
   Um host novo que ninguem liberou nao vira erro de seguranca: vira pagina
   quebrada em producao, que e como um CSP acaba afrouxado as pressas. */
for (const par of hostsSubrecurso) {
  const [host, rota] = par.split(" ");
  const pol = politicaDaRota(cfg, rota);
  const permitidos = new Set(
    Object.values(diretivasDe(pol?.csp)).flat().map((f) => f.replace(/^https?:\/\//, ""))
  );
  if (!permitidos.has(host))
    falhar(`${rota} carrega ${host} no HTML e ele nao esta em nenhuma diretiva da CSP DESSA rota — ` +
      "quebraria em producao");
}

/* ------------------------------------------- os hosts que o JS BUSCA ------- *
 * O bloco acima confere os hosts que o HTML CARREGA. Isto confere os hosts que
 * o JS CHAMA — e sao coisas diferentes, governadas por diretivas diferentes:
 * `script-src`/`style-src` mandam no primeiro, `connect-src` manda no segundo.
 * Nada olhava o segundo.
 *
 * O QUE PASSOU POR AQUI, em 2026-08-23. `site/js/console-v0.js` chamava
 * `https://polygon-rpc.com`, um quarto endpoint que nao esta no `connect-src`.
 * As outras tres telas usavam os tres liberados; essa era a unica fora, e este
 * portao estava VERDE em cima disso porque o host nunca aparece no HTML.
 *
 * O sintoma teria sido cruel. Em producao a CSP corta a chamada antes de
 * qualquer resposta: nao ha status, nao ha corpo, nao ha mensagem util — a
 * pagina so nao le a chain. Foi por acaso que o defeito apareceu legivel: quem
 * abriu a tela abriu por `python -m http.server`, que nao manda CSP, entao a
 * chamada saiu e voltou um `HTTP 401` que dava para ler na tela.
 *
 * ALCANCE, dito para nao ser comprado por mais do que vale: isto le o primeiro
 * argumento de cada `fetch(` e resolve literal ou identificador declarado no
 * mesmo arquivo. Uma URL montada em tempo de execucao a partir de pedacos nao e
 * resolvida — e nesse caso o portao REPROVA em vez de pular, porque guardiao que
 * nao consegue medir e obrigado a dizer que nao mediu.
 */
{
  const jsDoSite = [];
  (function andar(d) {
    for (const nome of readdirSync(d)) {
      const p = join(d, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (nome.endsWith(".js")) jsDoSite.push(p);
    }
  })(join(SITE, "js"));

  const connect = new Set((diretivas["connect-src"] || []).map((f) => f.replace(/^https?:\/\//, "")));
  let conferidos = 0;
  const deTela = [];

  for (const arquivo of jsDoSite) {
    const rel = "js/" + relative(join(SITE, "js"), arquivo).split(sep).join("/");
    const src = readFileSync(arquivo, "utf8");
    /* Comentarios fora antes de medir: prosa que cita um endpoint nao e uma
       chamada, e ja houve falso alarme nesta casa por medir dentro de comentario. */
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

    for (const m of codigo.matchAll(/\bfetch\s*\(\s*([^,)]+)/g)) {
      const arg = m[1].trim();
      let urls = [];

      /* MESMA ORIGEM. `fetch("/x.json")` ou um template que comeca com `/` nao
         tem host: quem manda nele e o `'self'` do connect-src, que ja esta la.
         Cobrar host de uma URL relativa seria inventar um problema. */
      if (/^["'`]\/[^"'`]*["'`]$/.test(arg)) { conferidos += 1; continue; }

      const lit = /^["'`](https?:\/\/[^"'`]+)["'`]$/.exec(arg);
      if (lit) {
        urls = [lit[1]];
      } else if (/^[A-Za-z_$][\w$.[\]]*$/.test(arg)) {
        const nome = arg.split(/[.[]/)[0];

        /* RESOLVER VEM PRIMEIRO, e a ordem e o conserto de um erro que este
           portao cometeu na sua primeira execucao: a heuristica de "veio da tela"
           rodava antes, procurava a declaracao do nome em QUALQUER lugar do
           arquivo, e casava com outra variavel homonima. O laco de failover de
           console-v0.js — `for (const url of TRIVIU.rpcs)` — foi classificado
           como endpoint digitado, e os tres hosts dele deixaram de ser
           conferidos enquanto o portao imprimia "5 conferidos". Verde afirmando
           cobertura que nao tinha e a forma exata de defeito que esta casa ja
           pagou. Resolve-se o que da para resolver; a heuristica so recebe o que
           sobrou. */
        const doLaco = new RegExp(`\\bfor\\s*\\(\\s*(?:const|let|var)\\s+${nome}\\s+of\\s+([\\w$.]+)`).exec(codigo);
        const alvoNome = doLaco ? doLaco[1].split(".").pop() : nome;
        const decl = new RegExp(`\\b(?:const|let|var)\\s+${alvoNome}\\s*=\\s*([^;]+);`).exec(codigo)
          || new RegExp(`\\b${alvoNome}\\s*:\\s*(\\[[^\\]]*\\])`).exec(codigo);
        if (decl) urls = [...decl[1].matchAll(/["'`](https?:\/\/[^"'`]+)["'`]/g)].map((x) => x[1]);

        /* DIGITADO PELA PESSOA. As telas deixam colar um endpoint proprio num
           campo, e um valor que so existe em tempo de execucao nao tem como ser
           conferido aqui. Isto NAO reprova, e a razao esta no efeito: sob esta
           CSP, um endpoint colado que nao seja um dos liberados simplesmente nao
           conecta — o navegador ja e o portao. O que se faz aqui e CONTAR e
           DIZER, para que ninguem descubra isso pela reclamacao de um usuario. */
        if (!urls.length) {
          const daTela = new RegExp(
            `\\b(?:const|let|var)\\s+${nome}\\s*=\\s*[^;\\n]*(?:\\$\\(|getElementById|\\.value)`
          ).test(codigo);
          if (daTela) { deTela.push(`${rel}: fetch(${nome})`); continue; }
        }
      }

      if (!urls.length) {
        falhar(`${rel}: fetch(${arg.slice(0, 40)}) — nao consegui resolver o host desta chamada, ` +
          "e um host que este portao nao le e um host que ninguem confere contra o connect-src");
        continue;
      }
      for (const u of urls) {
        const host = new URL(u).host;
        conferidos += 1;
        if (!connect.has(host)) {
          falhar(`${rel} chama ${host} e ele NAO esta no connect-src do vercel.json ` +
            `(${[...connect].join(" ")}). Em producao a CSP corta essa chamada antes de qualquer ` +
            "resposta — sem status e sem mensagem, a pagina so nao le a chain.");
        }
      }
    }
  }
  notas.push(`${conferidos} host(s) de fetch conferido(s) contra o connect-src (${[...connect].join(" · ")})`);
  /* Pular em silencio seria o mesmo defeito de sempre: o portao verde afirmando
     cobertura que ele nao tem. O que ele nao consegue conferir, ele CONTA. */
  if (deTela.length) {
    notas.push(`${deTela.length} chamada(s) buscam um endpoint DIGITADO num campo — nao ha o que ` +
      "conferir aqui, e sob esta CSP so os hosts acima conectam; qualquer outro o navegador recusa " +
      "antes de sair:");
    for (const d of deTela) notas.push("    " + d);
  }
}

/* ------------------------------------------------------- copia vendorizada - */
for (const [rel, sri] of Object.entries(VENDOR)) {
  let bytes;
  try {
    bytes = readFileSync(join(SITE, rel));
  } catch {
    falhar(`${rel} ausente — index.html aponta para ele e a cena 3D some`);
    continue;
  }
  const atual = createHash("sha512").update(bytes).digest("base64");
  if (atual !== sri) {
    falhar(`${rel}: sha512 divergiu do conferido contra o cdnjs`);
    falhar(`  esperado sha512-${sri.slice(0, 24)}…`);
    falhar(`  atual    sha512-${atual.slice(0, 24)}…`);
  } else {
    notas.push(`${rel} bate o SRI publicado pelo cdnjs (sha512-${sri.slice(0, 16)}…)`);
  }
}

/* ----------------------------------------------------------------- saida --- */
if (falhas.length) {
  console.error("✗ gates de assinatura: " + falhas.length + " falha(s)");
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ gates de assinatura: CSP script-src 'self' sem inline · ${htmls.length} paginas varridas · zero script de terceiro`);
for (const n of notas) console.log(`  ${n}`);
