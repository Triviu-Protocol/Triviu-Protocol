#!/usr/bin/env node
/**
 * Guardiao: onde o byte E a procedencia, o byte do disco tem de ser o byte do git.
 *
 * POR QUE ESTE PORTAO NASCEU, E O QUE ELE VIU
 * ---------------------------------------------------------------------------
 * O `.gitattributes` desta casa marca `-text` em tres familias — `*.sol`,
 * `site/vendor/`, e os binarios — e explica por que: em `contracts/out/` cada
 * artefato registra o keccak256 da fonte que entrou na compilacao, e e por esse
 * hash que se prova que o `.sol` deste repositorio e o mesmo que gerou o
 * bytecode vivo na Polygon.
 *
 * O `-text` protege o CLONE. Ele nao protege a arvore que ja estava no disco
 * quando o atributo chegou. Medido nesta casa em 2026-08-20:
 *
 *     contracts/src/TriviuLPVault.sol   indice LF (34561 b)   disco CRLF (35330 b)
 *     keccak do artefato  0xb22c4681...  disco 0x7ca6776b...  NAO BATE
 *                                        git   0xb22c4681...  BATE
 *
 * Dez `.sol` no mesmo estado — e `git status` dizia LIMPO. Nao ha malicia nisso:
 * o git decide "igual" pelo cache de stat do indice, e um arquivo escrito antes
 * de o atributo existir carrega um stat que nunca mais e conferido.
 *
 * O efeito e a pior forma de falso: quem recompilasse NESTE disco produziria
 * artefatos cujo metadata aponta para uma fonte que o contrato vivo nao
 * reconhece, e nada no repositorio diria uma palavra. A capa do produto diz
 * "Open source. Verifiable math." — a prova de procedencia so existe se o byte
 * atravessar o disco intacto, e ate aqui ninguem conferia se ele atravessou.
 *
 * O QUE ELE MEDE, EM DUAS CAMADAS
 * ---------------------------------------------------------------------------
 * 1. INVARIANTE DO BYTE  ·  todo caminho que o git reporta como `attr/-text`
 *    tem de ser byte-a-byte identico ao blob do INDICE. Indice, e nao HEAD: o
 *    indice e o que o commit vai gravar, e essa distincao ja custou uma cicatriz
 *    a esta casa.
 *
 * 1b. FORMA CANONICA  ·  o blob do INDICE, para as familias de TEXTO sob
 *    `-text`, nao pode conter nenhum byte CR. Isto NAO e uma comparacao: e uma
 *    afirmacao sobre o conteudo.
 *
 *    A camada 1 sozinha nao bastava, e o Tubarao-branco mediu por que
 *    (handoff 13, 2026-08-20): converter um arquivo para CRLF e ENCENA-LO faz
 *    disco e indice concordarem, e a camada 1 cala. O que segurava era a camada
 *    2 — que depende de `contracts/out/`, ausente por .gitignore em todo clone
 *    novo. Nas duas condicoes juntas o portao saia VERDE sobre um `.sol` CRLF
 *    ja no indice, e clone novo e exatamente o estado do CI.
 *
 *    Nao era hipotese. `site/vendor/estilos/index.css` (259 CR) e `selo.css`
 *    (193 CR) foram commitados assim horas antes, no `bf66cab`, e nada acusou.
 *
 * 1c. O ROL NAO PODE SER APAGADO  ·  todo `.sol` e todo `site/vendor/**`
 *    rastreado TEM de carregar `-text`.
 *
 *    Mesmo handoff: removidas as linhas `-text` do `.gitattributes`, este portao
 *    imprimia `caminhos com -text ... 0` e aprovava. Zero impresso nao e recusa.
 *    Um portao que se desliga editando o arquivo de que ele depende — e editar
 *    `.gitattributes` e um ato plausivel e bem-intencionado — nao guarda nada.
 *
 * 2. PROCEDENCIA DA FONTE  ·  quando `contracts/out/` existe, cada artefato
 *    declara `metadata.sources[x].keccak256`. Este portao recalcula o keccak256
 *    da fonte no disco e compara. E a medicao DIRETA da frase da capa; a camada
 *    1 e o proxy que a antecede.
 *
 * O QUE A CAMADA 2 NAO JULGA, E POR QUE A EXCECAO SE LIMITA SOZINHA
 * ---------------------------------------------------------------------------
 * `contracts/lib/forge-std` e SUBMODULO — outro repositorio, com o proprio
 * `.gitattributes`, que o daqui nao governa e que `git cat-file blob :caminho`
 * nunca responde. Os `.sol` dele estao em CRLF no disco e o keccak nao bate.
 *
 * Isso nao toca o bytecode vivo, e nao por confianca: MEDIDO. Os cinco contratos
 * do protocolo declaram, no proprio metadata, apenas fontes de `src/`:
 *
 *     TriviuLPVault  ParameterRegistry  GasTank  TriviuExecutor   1 fonte, 0 de lib
 *     TriviuCerca                                                 2 fontes, 0 de lib
 *
 * Entao a excecao nao e "lib nao conta". Ela e limitada pelo `compilationTarget`
 * do proprio artefato: quando o alvo da compilacao mora em `src/`, TODA fonte
 * dele e julgada, lib inclusive — no dia em que um contrato do protocolo
 * importar da lib, aquela fonte entra no veredito sem ninguem alterar este
 * arquivo. Fora disso, as fontes de dependencia sao CONTADAS e declaradas, nunca
 * caladas.
 *
 * `contracts/out/` esta no .gitignore, entao a camada 2 nao roda em toda arvore.
 * Quando ela nao roda, este portao DIZ que nao rodou e imprime o denominador.
 * Ausencia declarada e divida; ausencia calada e mentira de cobertura.
 *
 * O KECCAK E PROPRIO, ENTAO ELE SE AFERE ANTES DE JULGAR
 * ---------------------------------------------------------------------------
 * Nao ha `ethers` aqui, e `cast keccak` recebe os dados por argumento — 35 KB de
 * fonte nao cabem. O keccak256 abaixo e desta casa, e um portao cujo instrumento
 * nunca foi conferido reprova fonte boa e aprova fonte ruim com a mesma
 * facilidade. Ele roda 6 vetores de resposta conhecida antes de tocar em
 * qualquer arquivo: os dois primeiros conferidos contra DUAS implementacoes que
 * nao compartilham codigo (pycryptodome e `cast keccak`), e os quatro seguintes
 * cercando a fronteira de bloco de 136 bytes, que e onde uma absorcao errada se
 * esconde. Instrumento reprovado = portao recusa antes de medir.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ===================== keccak-256 ======================================== */

const MASCARA = (1n << 64n) - 1n;
const girar = (x, n) => ((x << n) | (x >> (64n - n))) & MASCARA;

const CONSTANTES = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROTACOES = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44]
  .map((n) => BigInt(n));
const DESTINOS = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];

function permutar(estado) {
  const b = new Array(5);
  for (let volta = 0; volta < 24; volta++) {
    for (let i = 0; i < 5; i++)
      b[i] = estado[i] ^ estado[i + 5] ^ estado[i + 10] ^ estado[i + 15] ^ estado[i + 20];
    for (let i = 0; i < 5; i++) {
      const t = b[(i + 4) % 5] ^ girar(b[(i + 1) % 5], 1n);
      for (let j = 0; j < 25; j += 5) estado[j + i] ^= t;
    }
    let t = estado[1];
    for (let i = 0; i < 24; i++) {
      const j = DESTINOS[i];
      const guardado = estado[j];
      estado[j] = girar(t, ROTACOES[i]);
      t = guardado;
    }
    for (let j = 0; j < 25; j += 5) {
      for (let i = 0; i < 5; i++) b[i] = estado[j + i];
      for (let i = 0; i < 5; i++)
        estado[j + i] = b[i] ^ ((~b[(i + 1) % 5] & MASCARA) & b[(i + 2) % 5]);
    }
    estado[0] ^= CONSTANTES[volta];
  }
}

/** keccak256 de um Buffer/Uint8Array. Devolve "0x" + 64 hex. */
export function keccak256(dados) {
  const TAXA = 136; /* 1088 bits: o rate do keccak-256 */
  const total = dados.length;
  const preenchido = Math.floor(total / TAXA) * TAXA + TAXA;
  const bloco = new Uint8Array(preenchido);
  bloco.set(dados);
  /* Padding do Keccak ORIGINAL (0x01), nao o do SHA3-256 (0x06). Trocar os dois
     produz um hash perfeitamente valido e completamente errado para Solidity. */
  bloco[total] = 0x01;
  bloco[preenchido - 1] |= 0x80;

  const estado = new Array(25).fill(0n);
  for (let inicio = 0; inicio < preenchido; inicio += TAXA) {
    for (let lane = 0; lane < TAXA / 8; lane++) {
      let v = 0n;
      for (let byte = 7; byte >= 0; byte--)
        v = (v << 8n) | BigInt(bloco[inicio + lane * 8 + byte]);
      estado[lane] ^= v;
    }
    permutar(estado);
  }

  let saida = "";
  for (let lane = 0; lane < 4; lane++) {
    let v = estado[lane];
    for (let byte = 0; byte < 8; byte++) {
      saida += Number(v & 0xffn).toString(16).padStart(2, "0");
      v >>= 8n;
    }
  }
  return "0x" + saida;
}

/* Vetores de resposta conhecida. Os dois primeiros conferidos contra
   pycryptodome E `cast keccak` — duas implementacoes que nao compartilham
   codigo. Os quatro de 'a' repetido cercam a fronteira de 136 bytes: 135 (um
   bloco com o padding apertado), 136 (o bloco cheio, que forca um bloco de
   padding inteiro), 137 (dois blocos) e 1000 (varios). */
const AFERICAO = [
  ["", "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"],
  ["abc", "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"],
  ["a".repeat(135), "0x34367dc248bbd832f4e3e69dfaac2f92638bd0bbd18f2912ba4ef454919cf446"],
  ["a".repeat(136), "0xa6c4d403279fe3e0af03729caada8374b5ca54d8065329a3ebcaeb4b60aa386e"],
  ["a".repeat(137), "0xd869f639c7046b4929fc92a4d988a8b22c55fbadb802c0c66ebcd484f1915f39"],
  ["a".repeat(1000), "0xb6a4ac1f51884d71f30fa397a5e155de3099e11fc0edef5d08b646e621e19de9"],
];

function aferirInstrumento() {
  const erros = [];
  for (const [entrada, esperado] of AFERICAO) {
    const obtido = keccak256(Buffer.from(entrada, "utf8"));
    if (obtido !== esperado)
      erros.push("keccak256(" + entrada.length + " bytes) = " + obtido + ", esperado " + esperado);
  }
  return erros;
}

/* ===================== o portao ========================================== */

const ehEntrada = resolve(process.argv[1] || "") === resolve(fileURLToPath(import.meta.url));

if (ehEntrada) {
  const falhas = [];
  const notas = [];

  const errosDoInstrumento = aferirInstrumento();
  if (errosDoInstrumento.length) {
    console.error("O INSTRUMENTO ESTA ERRADO — recuso medir com ele:");
    for (const e of errosDoInstrumento) console.error("  - " + e);
    console.error("");
    console.error("Um portao cujo keccak esta errado reprova fonte boa e aprova fonte ruim com a");
    console.error("mesma facilidade. Ele nao mede nada ate os 6 vetores baterem.");
    process.exit(1);
  }

  /* ---- camada 1 - o invariante do byte ---------------------------------- */

  const git = (...a) =>
    spawnSync("git", a, { cwd: RAIZ, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });

  /* Extensoes em que um byte CR e conteudo legitimo, nao quebra de linha. A
     regra da forma canonica NAO se aplica a elas — um .woff2 com 0x0D dentro
     esta certo, e reprova-lo seria o portao inventando defeito. */
  const BINARIO = /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|wasm|mp4|webm)$/i;

  const eol = git("ls-files", "--eol", "-z");
  let semGit = false;
  const comAtributo = [];
  const todosRastreados = [];
  const derivados = [];
  const comCR = [];

  if (eol.error || eol.status !== 0) {
    semGit = true;
    notas.push(
      "sem git alcancavel aqui — o invariante do byte NAO foi exercido. Ele pergunta ao git " +
      "quais caminhos carregam -text e compara com o blob do indice; sem git nao ha as duas pontas"
    );
  } else {
    /* `git ls-files --eol -z` sai como:  i/lf  w/crlf  attr/-text \t caminho \0 */
    for (const linha of eol.stdout.toString("utf8").split("\0")) {
      if (!linha) continue;
      const corte = linha.indexOf("\t");
      if (corte < 0) continue;
      const cabeca = linha.slice(0, corte);
      const caminho = linha.slice(corte + 1);
      todosRastreados.push(caminho);
      if (!/attr\/\S*-text/.test(cabeca)) continue;
      comAtributo.push(caminho);

      const blob = git("cat-file", "blob", ":" + caminho);
      if (blob.error || blob.status !== 0) {
        falhas.push(caminho + " carrega -text e o git nao devolveu o blob do indice para ele");
        continue;
      }

      /* 1b · forma canonica, medida NO INDICE. Encenar o CRLF faz disco e indice
         concordarem e a comparacao abaixo calar; esta afirmacao nao depende de
         comparacao nenhuma. */
      if (!BINARIO.test(caminho)) {
        const crs = blob.stdout.filter((b) => b === 0x0d).length;
        if (crs) comCR.push({ caminho, crs });
      }
      let disco;
      try {
        disco = readFileSync(join(RAIZ, caminho));
      } catch {
        falhas.push(caminho + " esta no indice e nao esta no disco");
        continue;
      }
      if (Buffer.compare(disco, blob.stdout) === 0) continue;

      const semCR = (b) => Buffer.from(b.toString("latin1").split("\r\n").join("\n"), "latin1");
      const soQuebra = Buffer.compare(semCR(disco), semCR(blob.stdout)) === 0;
      derivados.push({ caminho, delta: disco.length - blob.stdout.length, soQuebra });
    }
  }

  /* 1c · as familias cuja promessa e o hash TEM de estar sob -text. Sem isto o
     rol e apagavel: some do `.gitattributes`, o rol vai a zero, e o portao
     aprova imprimindo o zero. */
  const FAMILIAS = [
    { nome: "*.sol", casa: (p) => p.endsWith(".sol"),
      porque: "o keccak256 em contracts/out/ prova que esta fonte gerou o bytecode vivo" },
    { nome: "site/vendor/**", casa: (p) => p.startsWith("site/vendor/"),
      porque: "o sha512 fixado em check-csp so sobrevive a um clone se o byte nao for traduzido" },
  ];
  const semAtributo = new Set(comAtributo);
  for (const f of FAMILIAS) {
    if (semGit) break;
    const daFamilia = todosRastreados.filter(f.casa);
    const fora = daFamilia.filter((p) => !semAtributo.has(p));
    if (fora.length)
      falhas.push(
        fora.length + " de " + daFamilia.length + " arquivo(s) de `" + f.nome + "` NAO carregam -text: " +
        fora.slice(0, 3).join(" · ") + (fora.length > 3 ? " (e mais " + (fora.length - 3) + ")" : "") +
        ". " + f.porque + ". Sem o atributo, um clone traduz a quebra de linha e a promessa morre calada"
      );
  }

  for (const c of comCR) {
    falhas.push(
      c.caminho + " esta no INDICE com " + c.crs + " byte(s) CR, e carrega -text. " +
      "O disco pode estar de acordo com o indice e ainda assim errado: encenar o CRLF faz as duas " +
      "pontas concordarem sobre a forma errada. A forma canonica sob -text e LF, e ela nao depende " +
      "de comparacao com nada"
    );
  }

  for (const d of derivados) {
    const consequencia = d.caminho.endsWith(".sol")
      ? "o keccak256 que contracts/out/ registra deixa de bater, e a prova de que esta fonte " +
        "gerou o bytecode vivo na Polygon deixa de existir neste disco"
      : d.caminho.startsWith("site/vendor/")
        ? "o sha512 fixado em check-csp deixa de bater, e o portao fica vermelho num clone limpo"
        : "o arquivo e binario por atributo, e qualquer traducao o corrompe";
    falhas.push(
      d.caminho + " carrega -text e o disco DIVERGE do indice em " +
      (d.delta >= 0 ? "+" : "") + d.delta + " bytes" +
      (d.soQuebra
        ? " — so quebra de linha, que e a forma silenciosa: `git status` diz LIMPO"
        : " — o conteudo difere") +
      ". Consequencia: " + consequencia
    );
  }

  /* ---- camada 2 - a procedencia da fonte -------------------------------- */

  const OUT = join(RAIZ, "contracts", "out");
  let conferidas = 0;
  let ausentes = 0;
  let artefatos = 0;
  let deDependencia = 0;
  const rastreado = new Set(comAtributo);

  /* De onde vem a divergencia, dito so quando foi medido. A primeira versao
     escrevia "e o byte do indice bate" para todo caminho que nao aparecia na
     lista de derivados — inclusive para os do submodulo, que o indice deste
     repositorio nem conhece. Afirmar uma medicao que nao houve e o defeito que
     este portao existe para pegar; ele nao ia comete-lo na propria mensagem. */
  /* A chave do metadata e relativa a `contracts/` (`src/GasTank.sol`); o rol do
     git e relativo a raiz (`contracts/src/GasTank.sol`). Comparar as duas sem
     alinhar o prefixo fazia esta funcao chamar de "nao rastreado" um arquivo
     rastreado — o proprio defeito que este portao existe para pegar, cometido na
     mensagem dele. Pego pela saida do portao ao provar a camada 2 a mao. */
  const origemDaDivergencia = (chave) => {
    const caminho = "contracts/" + chave;
    if (derivados.some((d) => d.caminho === caminho))
      return " (mesmo arquivo da deriva de byte acima — uma causa, duas medicoes)";
    if (rastreado.has(caminho))
      return " (o byte do indice bate, entao a divergencia nasceu na compilacao, nao no clone)";
    return " (este caminho nao e rastreado por este repositorio — submodulo ou ignorado — " +
           "entao nao ha byte de indice com que comparar)";
  };

  if (!existsSync(OUT)) {
    notas.push(
      "contracts/out/ nao existe aqui (esta no .gitignore) — a procedencia da fonte NAO foi " +
      "exercida. Rode `forge build` dentro de contracts/ e este portao passa a medir o hash direto"
    );
  } else {
    for (const dir of readdirSync(OUT)) {
      const cheio = join(OUT, dir);
      let ehDir = false;
      try { ehDir = statSync(cheio).isDirectory(); } catch { ehDir = false; }
      if (!ehDir) continue;
      for (const arq of readdirSync(cheio)) {
        if (!arq.endsWith(".json")) continue;
        let j;
        try { j = JSON.parse(readFileSync(join(cheio, arq), "utf8")); } catch { continue; }
        const fontes = j && j.metadata && j.metadata.sources;
        if (!fontes) continue;
        artefatos++;

        /* O alvo da compilacao decide o rigor. `compilationTarget` e um objeto
           de uma chave: o caminho do contrato que ESTE artefato representa. */
        const alvo = Object.keys(
          (j.metadata.settings && j.metadata.settings.compilationTarget) || {}
        )[0] || "";
        const alvoEhProtocolo = alvo.startsWith("src/");
        const alvoEhDependencia = alvo.startsWith("lib/");

        for (const chave of Object.keys(fontes)) {
          const esperado = fontes[chave] && fontes[chave].keccak256;
          if (!esperado) continue;

          const ehDependencia = chave.startsWith("lib/");
          /* Julga: tudo que e nosso, sempre. E o que vem da lib SO quando o alvo
             da compilacao mora em `src/` — ali a fonte entra no bytecode que o
             protocolo publica, e ai a procedencia dela e a nossa. */
          const julgar = alvoEhDependencia ? false : !ehDependencia || alvoEhProtocolo;
          if (!julgar) { deDependencia++; continue; }

          const noDisco = join(RAIZ, "contracts", chave);
          if (!existsSync(noDisco)) { ausentes++; continue; }
          conferidas++;
          const obtido = keccak256(readFileSync(noDisco));
          if (obtido === esperado) continue;
          falhas.push(
            "contracts/" + chave + " nao e a fonte que gerou " + dir + "/" + arq +
            ": o artefato registra " + esperado.slice(0, 10) + "... e o disco produz " +
            obtido.slice(0, 10) + "..." + origemDaDivergencia(chave)
          );
        }
      }
    }
  }

  /* ---- relatorio -------------------------------------------------------- */

  const unicas = [...new Set(falhas)];

  console.log("portao da procedencia do byte · onde o hash e uma promessa");
  console.log("  caminhos com -text ........... " + (semGit ? "NAO SEI — sem git" : comAtributo.length) +
    (semGit ? "" : " de " + todosRastreados.length + " rastreados"));
  console.log("  divergentes do indice ........ " + (semGit ? "nao conferido" : derivados.length));
  console.log("  com CR no indice ............. " + (semGit ? "nao conferido" : comCR.length) +
    "  (forma canonica sob -text e LF)");
  console.log("  artefatos lidos .............. " + artefatos);
  console.log("  fontes conferidas por hash ... " + conferidas +
    (ausentes ? "  (" + ausentes + " nao estao no disco)" : ""));
  console.log("  fontes de dependencia ........ " + deDependencia +
    " nao julgadas (submodulo · nenhum contrato do protocolo as declara)");
  console.log("  instrumento .................. keccak proprio, " + AFERICAO.length +
    " vetores conferidos antes de medir");
  for (const n of notas) console.log("  nota: " + n);

  if (unicas.length) {
    console.error("");
    console.error("O BYTE NAO ATRAVESSOU:");
    for (const f of unicas) console.error("  - " + f);
    console.error("");
    console.error("  Conserto: `git checkout-index -f -- <caminho>` nem sempre reescreve — o cache");
    console.error("  de stat do indice o convence de que o arquivo ja esta certo. O que reescreve");
    console.error("  e gravar o blob por cima:   git cat-file blob :<caminho> > <caminho>");
    process.exit(1);
  }
  console.log("");
  console.log("✓ onde o byte e promessa, o disco diz o mesmo que o git");
}
