#!/usr/bin/env node
/* O TRILHO DOS PORTOES  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Ate hoje este repositorio tinha oito guardioes e a esteira rodava UM
 * (`check-multichain-honesty`, no job `surfaces`). Os outros sete passavam
 * quando alguem lembrava de roda-los a mao. Entre eles os dois que provam a
 * condicao de Lei #1 desta casa: que nenhuma tela de fora alcanca a subarvore
 * que assina, e que nenhuma pagina voltou a ter estilo inline.
 *
 * Guardiao que nao roda nao e guardiao. Este arquivo existe para que a
 * pergunta "isso chegou a rodar?" tenha uma resposta impressa, e nao uma
 * suposicao.
 *
 * ===========================================================================
 * TRES ARVORES, e o erro de tratar as tres como uma
 * ===========================================================================
 *
 * Os oito guardioes leem o DISCO. Sempre leram. Mas o disco nao e a unica
 * arvore em jogo, e as tres divergem:
 *
 *   INDICE   o que o proximo commit vai gravar        <- o hook julga esta
 *   COMMIT   o que existe no runner da esteira        <- o CI julga esta
 *   DISCO    a arvore de trabalho, com o que nunca    <- `vercel --prod`
 *            entrou no git                               publica ESTA
 *
 * Medido em 2026-08-19: ha cinco arquivos sob `site/` fora do git, entre eles
 * uma pagina que abre carteira. A esteira nunca os viu. Um `vercel --prod`
 * desta arvore os publicaria.
 *
 * Se o hook julgasse o DISCO, ele reprovaria todo commit deste repositorio por
 * causa de arquivo que o commit nem toca — e quem apanha disso tres vezes
 * aprende `--no-verify`. Portao que empurra para o bypass e pior que portao
 * ausente. Por isso o hook materializa o INDICE (`git checkout-index`, 0,2 s)
 * e roda os guardioes LA: ele julga o que voce esta gravando, nada mais.
 *
 * E o disco continua tendo juiz — `--pre-publicacao`, que se roda ANTES de
 * publicar, e que recusa quando o disco DIVERGE do commit sob `site/`. Nao so o
 * que nunca entrou no git: um arquivo rastreado e modificado depois do commit
 * sobe exatamente igual, e a diferenca entre os dois casos nao existe para o
 * deploy — as duas sao bytes que ninguem revisou indo ao ar.
 *
 * ===========================================================================
 * AS OUTRAS DUAS DECISOES
 * ===========================================================================
 *
 * DESCOBRE, nao lista. Varre `check-*.mjs`. Um guardiao novo entra na esteira
 * no instante em que nasce — sem um segundo lugar para lembrar de editar. O
 * modo de falha "guardiao escrito, nunca cabeado" morre aqui.
 *
 * LISTA NOMINAL, porque descoberta encolhe em silencio — e porque CONTAR nao
 * basta. A primeira versao guardava um piso numerico; o Tubarao-branco apagou o
 * portao de Lei #1, pos um inerte no lugar, e a contagem seguiu em nove. Um
 * numero e satisfeito por qualquer coisa que ocupe o espaco. A lista cobra NOME.
 *
 * ===========================================================================
 * MODOS
 * ===========================================================================
 *   node scripts/portoes.mjs                    disco · a arvore de trabalho
 *   node scripts/portoes.mjs --indice           indice · o que o commit grava
 *   node scripts/portoes.mjs --pre-publicacao   disco, e RECUSA se qualquer
 *                                               caminho sob site/ divergir do commit
 *
 * FALHA FECHADA: se `git` nao responder, `--indice` e `--pre-publicacao`
 * RECUSAM. Nao saber o que sera gravado ou publicado nao e o mesmo que saber
 * que nao ha nada.
 */
import { readdirSync, mkdtempSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { OBRIGATORIOS } from "./_obrigatorios.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/* GUARDIOES QUE DEPENDEM DE ARTEFATO DE BUILD, e por que isso precisa de nome.
 *
 * `check-console-abi` compara `site/js/abi-console.js` com o que sai de
 * `contracts/out/` — os artefatos do `forge build`, que estao no .gitignore.
 * Isso significa que ele NAO roda sobre o indice nem sobre um clone novo: o
 * insumo dele nao esta no git.
 *
 * Medido em 2026-08-19: no disco ele passa, porque existe um `forge build`
 * antigo nesta maquina. Sobre o indice ele explode com ENOENT. Nas duas vezes
 * a resposta parece a mesma para quem le rapido, e nao e: uma e "o console
 * confere com o contrato", a outra e "eu nao consegui olhar".
 *
 * A regra abaixo separa as duas. Quando o artefato existe, ele e emprestado a
 * arvore avaliada. Quando nao existe, o portao so RECUSA se o que esta sendo
 * gravado tocar o ABI — caso contrario ele diz, impresso, que nao rodou e por
 * que. Recusar um commit de README por falta de compilador e o caminho mais
 * curto para alguem descobrir o `--no-verify`. */
const DEPENDEM_DE_BUILD = {
  "check-console-abi.mjs": {
    artefato: join("contracts", "out"),
    gatilhos: ["contracts/", "site/js/abi-console.js"],
    comando: "cd contracts && forge build",
  },
};

/* ===========================================================================
 * PONTE DECLARADA · e ela foi construida para se destruir sozinha
 * ===========================================================================
 *
 * `check-console-abi` compara `site/js/abi-console.js` com o ABI gerado a partir
 * de `contracts/out/`. Entre os artefatos que ele le esta
 * `TriviuRegistry.sol/TriviuRegistry.json` — e `TriviuRegistry.sol` NAO ESTA
 * NESTE REPOSITORIO. Nem ele, nem `TriviuFactory.sol`, nem `TriviuVault.sol`.
 * Estao no disco de quem construiu, fora do git.
 *
 * Isso torna o resultado desse portao vazio nos dois sentidos, e o segundo e o
 * perigoso:
 *
 *   num clone limpo   -> ENOENT. o portao nao consegue olhar.
 *   nesta maquina     -> PASSA, lendo um `forge build` antigo feito quando os
 *                        tres arquivos existiam. verde FALSO, e o pior tipo:
 *                        aquele que some quando outra pessoa clona.
 *
 * Enquanto a fonte nao estiver no repositorio, este portao nao roda — e o
 * trilho IMPRIME a divida em toda execucao, para que ela nao vire paisagem.
 *
 * A DIVIDA REAL nao e o job vermelho. E que este repositorio e publico, AGPL, e
 * a capa dele diz "Open source. Verifiable math." O ABI que a tela consome para
 * nomear funcao de contrato NAO E DERIVAVEL do codigo publicado. Quem clona nao
 * reproduz o artefato que a interface usa. Isso e verificabilidade, nao estetica.
 *
 * A PONTE SE DESTROI: `pontesAtivas()` confere se os tres .sol entraram no git.
 * No dia em que entrarem, esta ponte deixa de ter razao — e o trilho RECUSA ate
 * alguem apagar este bloco. Ponte que sobrevive a divida vira ponte permanente,
 * e ponte permanente e um guardiao desligado com desculpa por escrito. */
/* PONTES · vazio, e a razao esta escrita porque um dia estara cheio de novo.
 *
 * Este mecanismo carregou UMA divida, de 2026-08-19 ate 2026-08-19: o ABI do
 * console derivava de contratos que nao estavam neste repositorio. Ela foi
 * QUITADA — os quatro `.sol` entraram, com procedencia provada por keccak256
 * contra o artefato dos contratos vivos na Polygon — e a ponte se destruiu
 * sozinha, como fora desenhada: detectou as fontes no git e passou a RECUSAR
 * ate esta entrada sair.
 *
 * O mecanismo fica. Uma ponte declarada e a unica forma honesta de desligar um
 * portao: com nome, razao, quitacao e PRAZO. O que nao existe mais e desligar
 * sem escrever por que. */
const PONTES = {};

/* A lista nominal vive em `_obrigatorios.mjs` · fonte unica, porque o corpus de
   mordida tambem precisa dela para cobrar cobertura. Duas copias sairiam de
   sincronia no primeiro guardiao novo. */

/* Raizes que um deploy publica. Arquivo fora do git aqui e arquivo que sobe
   sem ter passado por revisao nenhuma. */
const RAIZES_PUBLICADAS = ["site"];

const modoIndice = process.argv.includes("--indice");
const prePublicacao = process.argv.includes("--pre-publicacao");

if (modoIndice && prePublicacao) {
  console.error("--indice e --pre-publicacao julgam arvores diferentes. Escolha uma.");
  process.exit(2);
}

/* PROVA DE VIDA · para quem o corpus nao alcanca
 * ---------------------------------------------------------------------------
 * O corpus (`check-portoes-mordem`) prova que um portao morde: esvazia-lo no
 * laboratorio tem de fazer o portao recusar. Dois portoes ficam fora desse
 * alcance por razao medida — `check-tesouraria-viva` precisaria de rede no CI e
 * no hook, e `check-portoes-mordem` nao se audita (esvazia-lo mantendo o nome
 * passa pela lista nominal e por si mesmo).
 *
 * O Tubarao-branco mediu o buraco em agua limpa, em 2026-08-19:
 *
 *     esvaziei check-tesouraria-viva -> corpus EXIT=0 · trilho EXIT=0
 *     esvaziei check-portoes-mordem  -> trilho: "OK 15 de 15 portoes ... passaram"
 *
 * O mecanismo que a Lei #14 usa para provar portao cravado podia ser esvaziado,
 * e o trilho AFIRMAVA `OK 15 de 15`. Exit 0 nao e prova de trabalho: um arquivo
 * vazio sai 0.
 *
 * Entao para esses dois o trilho passa a ler a SAIDA e cobrar nela um sinal que
 * so existe se o portao tiver de fato trabalhado — e, onde ha contagem, um piso
 * numerico. Um portao esvaziado nao imprime o que nao calculou.
 *
 * Isto NAO substitui o corpus: e o que sobra quando o corpus nao alcanca, e
 * cobre menos. Esta escrito aqui para ninguem confundir os dois. */
const PROVA_DE_VIDA = {
  "check-portoes-mordem": {
    padrao: /mordidas confirmadas\s*\.*\s*(\d+) de (\d+)/,
    piso: 20,
    porque: "o corpus tem de dizer quantas mordidas confirmou, e o numero tem de ser o de um corpus vivo",
  },
  "check-tesouraria-viva": {
    padrao: /origem\s*\.*\s*(\d+) endpoints? concordando/,
    piso: 2,
    porque: "a invariante da tesouraria so se conclui lendo a chain em mais de um endpoint",
  },
};

function conferirProvaDeVida(nome, saida) {
  const regra = PROVA_DE_VIDA[nome];
  if (!regra) return null;
  const m = regra.padrao.exec(saida || "");
  if (!m)
    return `${nome} saiu com exit 0 e NAO imprimiu a prova de vida que lhe cabe (${regra.porque}). ` +
           "Arquivo vazio tambem sai 0 — este portao esta fora do corpus, entao a saida dele E a prova";
  const n = Number(m[1]);
  if (Number.isFinite(regra.piso) && n < regra.piso)
    return `${nome} passou com ${n}, abaixo do piso ${regra.piso}. ${regra.porque}`;
  return null;
}

const git = (...args) => spawnSync("git", args, { cwd: RAIZ, encoding: "utf8" });

/* ------------------------------------------------- materializar o indice */

let arvoreAvaliada = RAIZ;
let temporario = null;

if (modoIndice) {
  const sonda = git("rev-parse", "--git-dir");
  if (sonda.error || sonda.status !== 0) {
    console.error("--indice, e git nao respondeu. Nao sei o que este commit gravaria — recuso.");
    process.exit(1);
  }
  temporario = mkdtempSync(join(tmpdir(), "triviu-indice-"));
  const saida = git("checkout-index", "-a", "--prefix=" + temporario.split("\\").join("/") + "/");
  if (saida.status !== 0) {
    console.error("nao consegui materializar o indice — recuso:");
    console.error((saida.stderr || saida.stdout || "").trim());
    rmSync(temporario, { recursive: true, force: true });
    process.exit(1);
  }
  arvoreAvaliada = temporario;

  /* Empresta os artefatos de build a arvore do indice. Junction no Windows,
     symlink nos demais — Node ignora o tipo fora do Windows. */
  for (const { artefato } of Object.values(DEPENDEM_DE_BUILD)) {
    const origem = join(RAIZ, artefato);
    if (!existsSync(origem)) continue;
    try {
      symlinkSync(origem, join(temporario, artefato), "junction");
    } catch {
      /* sem link, o guardiao cai na regra do artefato ausente logo abaixo */
    }
  }
}

const limpar = () => {
  if (temporario) rmSync(temporario, { recursive: true, force: true });
};

try {
  correr();
} finally {
  limpar();
}

/* ------------------------------------------------------------------------- */

function correr() {
  const dirScripts = join(arvoreAvaliada, "scripts");

  const portoes = readdirSync(dirScripts)
    .filter((f) => f.startsWith("check-") && f.endsWith(".mjs"))
    .sort();

  const nomeArvore = modoIndice
    ? "INDICE — o que este commit vai gravar"
    : prePublicacao
      ? "DISCO — o que `vercel --prod` publicaria"
      : "DISCO — a arvore de trabalho";

  console.log("trilho dos portoes · " + portoes.length + " descobertos · arvore: " + nomeArvore);
  console.log("");

  /* O que este commit grava — usado so para decidir se um guardiao que depende
     de artefato de build precisa mesmo rodar quando o artefato nao existe. */
  const staged = modoIndice
    ? (git("diff", "--cached", "--name-only").stdout || "").split("\n").filter(Boolean)
    : [];

  /* Uma ponte so vale enquanto a divida dela existe. Devolve, por portao:
       true  · a divida continua aberta, a ponte vale
       false · a divida foi paga — a ponte tem de sair, e o trilho vai recusar
       null  · git nao respondeu, nao da para saber (mantem a ponte, imprime) */
  const pontesAtivas = () => {
    const estado = {};
    for (const [arq, ponte] of Object.entries(PONTES)) {
      const r = git("ls-files", "--error-unmatch", ...ponte.fontes_ausentes);
      estado[arq] = r.error ? null : r.status !== 0;
    }
    return estado;
  };
  const ponteAtiva = pontesAtivas();

  const reprovados = [];
  const naoRodaram = [];
  const pontesQuitadas = [];
  const pontesVencidas = [];
  const saidas = new Map();

  for (const p of portoes) {
    const nome = basename(p, ".mjs");

    /* Ponte declarada · o portao nao roda, e a divida sai impressa. */
    const ponte = PONTES[p];
    if (ponte) {
      if (ponteAtiva[p] === false) {
        pontesQuitadas.push(p);
        console.log("  RECUSA  " + nome + "  (a divida da ponte foi paga · tire a ponte)");
        continue;
      }
      const hoje = new Date().toISOString().slice(0, 10);
      if (hoje > ponte.vence_em) {
        pontesVencidas.push(p);
        console.log("  RECUSA  " + nome + "  (a ponte venceu em " + ponte.vence_em + ")");
        continue;
      }
      naoRodaram.push(
        nome + " — PONTE DECLARADA em " + ponte.aberta_em + ", vence em " + ponte.vence_em + ": " + ponte.razao +
        (ponteAtiva[p] === null ? " · [git nao respondeu, ponte mantida sem confirmar]" : "") +
        "\n      fontes fora do git: " + ponte.fontes_ausentes.join(", ") +
        "\n      quitacao: " + ponte.quitacao
      );
      console.log("  ----    " + nome + "  (nao roda · ponte ate " + ponte.vence_em + ")");
      continue;
    }

    const dep = DEPENDEM_DE_BUILD[p];
    if (dep && !existsSync(join(arvoreAvaliada, dep.artefato))) {
      const tocado = !modoIndice || staged.some((f) => dep.gatilhos.some((g) => f.startsWith(g)));
      if (tocado) {
        reprovados.push(nome);
        saidas.set(
          nome,
          "NAO RODOU — o insumo dele, " + dep.artefato + ", nao existe (esta no .gitignore).\n" +
          "Isto NAO e uma violacao encontrada: e o guardiao sem conseguir olhar.\n" +
          "E recuso mesmo assim porque o que esta sendo gravado toca o ABI.\n" +
          "Conserto, um comando:  " + dep.comando
        );
        console.log("  RECUSA  " + nome + "  (nao rodou: " + dep.artefato + " ausente)");
      } else {
        naoRodaram.push(nome + " — " + dep.artefato + " ausente, e nada gravado toca o ABI");
        console.log("  ----    " + nome + "  (nao rodou · " + dep.artefato + " ausente · nada staged toca o ABI)");
      }
      continue;
    }

    const r = spawnSync(process.execPath, [join(dirScripts, p)], {
      cwd: arvoreAvaliada,
      encoding: "utf8",
    });
    const bruto = ((r.stdout || "") + (r.stderr || "")).trimEnd();
    let ok = r.status === 0;
    let motivoSemVida = null;
    if (ok) {
      motivoSemVida = conferirProvaDeVida(nome, bruto);
      if (motivoSemVida) ok = false;
    }
    if (!ok) {
      reprovados.push(nome);
      saidas.set(nome, motivoSemVida ? motivoSemVida + "\n\n--- saida do portao ---\n" + bruto : bruto);
    }
    console.log(
      "  " + (ok ? "PASSA " : "RECUSA") + "  " + nome +
      (ok ? "" : motivoSemVida ? "  (exit 0, SEM PROVA DE VIDA)" : "  (exit " + r.status + ")")
    );
  }

  if (naoRodaram.length) {
    console.log("");
    console.log("nao rodaram (com razao impressa, nunca em silencio):");
    for (const n of naoRodaram) console.log("  · " + n);
  }

  /* ------------------------------------------------------------ o disco */

  const st = git("status", "--porcelain", "--untracked-files=all");
  const arvore =
    st.error || st.status !== 0
      ? null
      : st.stdout
          .split("\n")
          .filter(Boolean)
          .map((l) => ({ marca: l.slice(0, 2), caminho: l.slice(3).replace(/^"|"$/g, "") }));

  let foraDoGit = [];
  console.log("");
  if (arvore === null) {
    console.log("o disco ... NAO SEI — git nao respondeu");
  } else {
    const sob = (c) => RAIZES_PUBLICADAS.some((r) => c === r || c.startsWith(r + "/"));
    const sujos = arvore.filter((e) => sob(e.caminho));
    foraDoGit = sujos.filter((e) => e.marca === "??");
    console.log("o disco, sob " + RAIZES_PUBLICADAS.join("/") + ":");
    console.log("  fora do git ... " + foraDoGit.length + "   (subiriam num `vercel --prod`)");
    console.log("  modificado .... " + (sujos.length - foraDoGit.length));
    for (const e of foraDoGit) console.log("      ?? " + e.caminho);
  }

  /* -------------------------------------------------------- veredictos */

  const falhas = [];

  const faltando = OBRIGATORIOS.filter((o) => !portoes.includes(o));
  if (faltando.length)
    falhas.push(
      faltando.length + " guardiao(oes) da lista nominal nao esta(o) aqui: " + faltando.join(", ") +
      ". Sumiu de scripts/, foi renomeado para fora do padrao check-*.mjs, ou nao foi staged. " +
      "Contar portoes nao bastava — nove continuam nove com um inerte no lugar do que prova a Lei #1."
    );

  if (reprovados.length) falhas.push(reprovados.length + " portao(oes) recusou: " + reprovados.join(", "));

  for (const p of pontesVencidas)
    falhas.push(
      "a ponte de " + p + " venceu em " + PONTES[p].vence_em + " e a divida continua aberta: " +
      PONTES[p].fontes_ausentes.join(", ") + " seguem fora do git. Ponte sem prazo vira permanente, " +
      "e portao permanentemente desligado e portao que nao existe. Quite (" + PONTES[p].quitacao +
      ") ou renegocie a data por escrito, com quem tem autoridade para isso."
    );

  for (const p of pontesQuitadas)
    falhas.push(
      "a ponte de " + p + " foi aberta em " + PONTES[p].aberta_em + " porque " +
      PONTES[p].fontes_ausentes.join(", ") + " estavam fora do git. Elas ENTRARAM. " +
      "A divida foi paga e a ponte continua de pe — o que significa que este portao segue " +
      "desligado sem razao. Apague a entrada de PONTES em scripts/portoes.mjs e deixe-o correr."
    );

  if (prePublicacao) {
    if (arvore === null) {
      falhas.push(
        "--pre-publicacao e git nao respondeu. Nao sei o que seria publicado, e nao saber nao e o mesmo que nao ter nada."
      );
    } else {
      /* TUDO QUE DIVERGE DO COMMIT, nao so o que nunca entrou.
       *
       * A primeira versao so olhava `??`. Um `site/index.html` MODIFICADO e nao
       * commitado passava com exit 0, imprimindo "nada fora do git sob site" —
       * e `vercel --prod` publica a arvore de trabalho, entao aquela modificacao
       * subiria exatamente como um arquivo untracked subiria. A diferenca entre
       * "nunca entrou no git" e "entrou e mudou depois" nao existe para o
       * deploy: as duas sao bytes que ninguem revisou indo ao ar.
       *
       * O criterio certo e um so: sob `site/`, o disco tem de ser IGUAL ao
       * commit. Qualquer divergencia recusa. */
      const divergem = arvore.filter((e) =>
        RAIZES_PUBLICADAS.some((r) => e.caminho === r || e.caminho.startsWith(r + "/"))
      );
      if (divergem.length) {
        const rotulo = (marca) =>
          marca === "??" ? "fora do git" : marca.includes("D") ? "apagado" : "modificado apos o commit";
        falhas.push(
          divergem.length + " caminho(s) sob " + RAIZES_PUBLICADAS.join("/") +
          " divergem do commit e SUBIRIAM num `vercel --prod`:\n" +
          divergem.map((e) => "      " + e.marca + "  " + e.caminho + "   (" + rotulo(e.marca) + ")").join("\n")
        );
      }
    }
  }

  if (falhas.length) {
    console.error("");
    console.error("TRILHO RECUSA:");
    for (const f of falhas) console.error("  - " + f);
    for (const [nome, saida] of saidas) {
      console.error("");
      console.error("--- " + nome + " ---");
      console.error(saida);
    }
    limpar();
    process.exit(1);
  }

  console.log("");
  /* Dizer "9 passaram" quando 8 rodaram e 1 esta em ponte e a mesma familia de
     imprecisao que este trilho existe para matar: o numero certo, o verbo errado.
     Quem le o resumo tem de saber quantos foram de fato exercidos. */
  const rodaram = portoes.length - naoRodaram.length;
  console.log(
    "OK  " + rodaram + " de " + portoes.length + " portoes rodaram e passaram sobre o " +
    (modoIndice ? "INDICE" : "DISCO") +
    (naoRodaram.length ? " · " + naoRodaram.length + " em ponte declarada (acima)" : "") +
    (prePublicacao ? " · nada divergindo do commit sob " + RAIZES_PUBLICADAS.join("/") : "")
  );
}
