#!/usr/bin/env node
/* PORTAO DO PROPRIO PORTAO  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Esta casa ja perdeu dois meses com infraestrutura que existia, era citada
 * como canon, e nunca tinha rodado: um workflow com 300 execucoes e zero jobs,
 * um `test.yml` cabeado para um branch inexistente, um hook versionado desde
 * sempre e jamais instalado. O padrao nao e descuido — e que nada verifica o
 * verificador.
 *
 * Este guardiao verifica o hook. Ele nao consegue provar que o hook esta LIGADO
 * (isso e `core.hooksPath`, configuracao por clone, e o CI nao tem clone de
 * ninguem). Prova o resto, que e o que apodrece calado:
 *
 *   1. o arquivo existe onde o comando de ligar aponta
 *   2. ele invoca o trilho, e no modo do indice
 *   3. ele nao tem CR — um `\r` depois do shebang faz o kernel procurar um
 *      interpretador chamado "sh\r", e a mensagem de erro nao diz isso
 *   4. o .gitattributes protege o item 3 de voltar num clone Windows
 *   5. o bit de execucao esta gravado no INDICE como 100755 — o disco desta
 *      maquina nao serve de prova, e o git ignora hook sem +x sem avisar
 *
 * O QUE ELE NAO PROVA, dito aqui para ninguem ler mais do que esta escrito:
 * que alguem rodou `git config core.hooksPath .githooks`. Um clone novo continua
 * chegando sem hook, e continua sem ser avisado. Isso e residuo declarado, nao
 * coberto — e o mesmo residuo que a ONDA-S deixou aberto no outro repositorio.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(RAIZ, ".githooks", "pre-commit");
const ATTRS = join(RAIZ, ".gitattributes");

const falhas = [];
const notas = [];

/* 1 · existe */
if (!existsSync(HOOK)) {
  console.error("✗ .githooks/pre-commit nao existe.");
  console.error("  O comando que a documentacao manda rodar — git config core.hooksPath .githooks —");
  console.error("  apontaria para um diretorio sem o hook, e o git nao reclama disso: ele");
  console.error("  simplesmente nao roda hook nenhum. Silencio total.");
  process.exit(1);
}

const src = readFileSync(HOOK, "utf8");
const bytes = readFileSync(HOOK);

/* 2 · invoca o trilho, no modo do indice */
if (!src.includes("portoes.mjs"))
  falhas.push(".githooks/pre-commit nao invoca scripts/portoes.mjs — o hook existe e nao checa nada");
if (!src.includes("--indice"))
  falhas.push(
    ".githooks/pre-commit nao passa --indice. Sem isso ele julgaria a arvore de trabalho, " +
    "reprovaria commits por arquivo que o commit nao toca, e ensinaria --no-verify"
  );

/* 3 · sem CR */
const crs = bytes.filter((b) => b === 0x0d).length;
if (crs > 0)
  falhas.push(
    ".githooks/pre-commit tem " + crs + " byte(s) CR. Um \\r depois do shebang faz o kernel " +
    "procurar um interpretador chamado \"sh\\r\". A mensagem de erro nao diz isso, e a hora perdida e sempre a mesma"
  );

/* 4 · o .gitattributes segura o item 3 */
if (!existsSync(ATTRS)) {
  falhas.push(
    "nao ha .gitattributes. Num clone com core.autocrlf=true o hook chega com CRLF e para de " +
    "funcionar — o item 3 deste guardiao passa aqui e falha na maquina de quem clonou"
  );
} else {
  const a = readFileSync(ATTRS, "utf8");
  if (!/\.githooks\/\*\*\s+text\s+eol=lf/.test(a))
    falhas.push(".gitattributes nao declara `.githooks/** text eol=lf` — o hook pode voltar com CRLF num clone Windows");
}

/* 5 · executavel — e a fonte da verdade aqui e o INDICE, nao o disco.
 *
 * Medido em 2026-08-19, e por pouco nao passou batido: no Windows o `chmod +x`
 * roda, o shell mostra `-rwxr-xr-x`, e o git grava `100644` assim mesmo — o
 * sistema de arquivos nao carrega o bit, entao o git nunca o ve. O hook chega
 * ao runner Linux sem +x, e o git **ignora hook nao-executavel sem dizer nada**.
 * Um portao inteiro morre em silencio por causa de um bit que o disco desta
 * maquina nao sabe representar.
 *
 * Conserto, se este guardiao reprovar:  git update-index --chmod=+x .githooks/pre-commit
 *
 * Por isso a ordem: pergunta ao git primeiro. So cai no disco quando nao ha git
 * a quem perguntar (a arvore materializada do modo --indice), e diz qual dos
 * dois usou. */
let fonteDoModo;
const noIndice = spawnSync("git", ["ls-files", "-s", ".githooks/pre-commit"], {
  cwd: RAIZ,
  encoding: "utf8",
});

if (!noIndice.error && noIndice.status === 0 && noIndice.stdout.trim()) {
  fonteDoModo = "indice do git";
  const modo = noIndice.stdout.trim().split(/\s+/)[0];
  if (modo !== "100755")
    falhas.push(
      ".githooks/pre-commit esta no indice como " + modo + ", nao 100755. O git IGNORA hook sem " +
      "bit de execucao e nao avisa — o portao estaria morto no runner. " +
      "Conserto: git update-index --chmod=+x .githooks/pre-commit"
    );
} else if (process.platform === "win32") {
  fonteDoModo = "nenhuma — sem git aqui, e o Windows nao representa o bit";
  notas.push("bit de execucao NAO conferido nesta passagem. O job do CI confere contra o indice.");
} else {
  fonteDoModo = "disco";
  const modo = statSync(HOOK).mode;
  if (!(modo & 0o111))
    falhas.push(".githooks/pre-commit nao esta executavel (modo " + (modo & 0o777).toString(8) + ") — o git ignora hook sem +x, sem avisar");
}

/* 6 · O HOOK ESTA LIGADO NESTE CLONE?
 *
 * Ate agora este guardiao imprimia, com todas as letras, "NAO conferido: se
 * alguem rodou git config core.hooksPath". Imprimir nao e cobrir. O criterio 2
 * da onda pedia um teste, e o argumento para nao ter um era que ele falharia no
 * CI — onde nao existe clone de desenvolvedor e hook nao faz sentido.
 *
 * O argumento vale; a conclusao nao. Basta o teste saber ONDE esta rodando:
 *
 *   na esteira        · nao se aplica, e diz por que
 *   num clone de gente · hooksPath tem de apontar para .githooks, ou RECUSA
 *
 * A deteccao usa `process.env.CI`, que GitHub Actions define. E uma alavanca que
 * alguem poderia puxar para calar o portao — por isso o ramo tomado sai
 * IMPRESSO em toda execucao. Portao que muda de comportamento em silencio e o
 * defeito que este arquivo inteiro existe para combater.
 *
 * E pergunta ao git, nunca ao caminho fixo: na ONDA-S do repositorio irmao seis
 * testes quebraram por checar `.git/hooks` com o hook instalado e funcionando. */
const naEsteira = Boolean(process.env.CI);
let hookLigado;
if (naEsteira) {
  hookLigado = "nao se aplica · esteira nao tem clone de desenvolvedor";
} else {
  const cfg = spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: RAIZ, encoding: "utf8" });
  const valor = (cfg.stdout || "").trim();

  /* PERGUNTAR SE HA REPOSITORIO, E PERGUNTAR SEPARADO.
     `git config --get` devolve 1 para "a chave nao existe" E TAMBEM para "nao ha
     repositorio nenhum" — ele cai no config global e nao acha a chave la. Os dois
     casos chegam identicos, e trata-los juntos fazia este portao gritar "o hook
     esta desligado" dentro da arvore materializada do modo --indice, que e um
     diretorio temporario sem `.git`. Nao e hook desligado: e nao haver clone para
     ligar. Quem responde essa pergunta e `rev-parse --git-dir`, que devolve 128
     fora de repositorio e 0 dentro. */
  const sonda = spawnSync("git", ["rev-parse", "--git-dir"], { cwd: RAIZ, encoding: "utf8" });
  const semRepositorio = cfg.error || sonda.error || sonda.status !== 0;

  if (semRepositorio) {
    hookLigado = "nao se aplica · esta arvore nao e um clone git (indice materializado)";
  } else if (valor === ".githooks") {
    hookLigado = "sim · core.hooksPath = .githooks";
  } else if (!valor && process.env.CI) {
    /* NO RUNNER, ESTA PERGUNTA NAO SE APLICA — e a resposta errada quebrava o CI.
     *
     * `actions/checkout` produz um clone novo, e clone novo nunca tem
     * `core.hooksPath`. O runner tambem nunca commita: ele roda o trilho e vai
     * embora. Cobrar dele a configuracao de hook de desenvolvedor fazia o job
     * `portoes` falhar por motivo alheio ao codigo auditado — o Tubarao-branco
     * mediu isso num clone limpo e o job estava vermelho sem ninguem ter visto,
     * porque o workflow so dispara em PR e em push para main.
     *
     * O que continua sendo cobrado no runner: que o hook EXISTA, esteja no
     * indice com bit de execucao, e invoque o trilho — tudo verificado acima.
     * O que sai e so a pergunta "este clone esta configurado para usa-lo". */
    hookLigado = "nao se aplica · runner de CI (clone efemero, nao commita)";
  } else if (!valor) {
    falhas.push(
      "core.hooksPath nao esta configurado neste clone: nenhum commit passa pelos portoes. " +
      "Uma linha resolve, e ela esta no CONTRIBUTING:  git config core.hooksPath .githooks"
    );
    hookLigado = "NAO";
  } else {
    falhas.push(
      "core.hooksPath aponta para '" + valor + "', nao para .githooks. core.hooksPath SUBSTITUI o " +
      "diretorio de hooks inteiro — apontar para outro lugar desliga o pre-commit desta casa em silencio"
    );
    hookLigado = "NAO · aponta para " + valor;
  }
}

/* ------------------------------------------------------------- relatorio */

console.log("portao do proprio portao · .githooks/pre-commit");
console.log("  invoca o trilho .......... " + (src.includes("portoes.mjs") ? "sim" : "NAO"));
console.log("  julga o indice ........... " + (src.includes("--indice") ? "sim" : "NAO"));
console.log("  bytes CR ................. " + crs);
console.log("  .gitattributes protege ... " + (existsSync(ATTRS) ? "sim" : "NAO"));
console.log("  bit de execucao .......... conferido via " + fonteDoModo);
console.log("  ligado neste clone ....... " + hookLigado);
for (const n of notas) console.log("  nota: " + n);

if (falhas.length) {
  console.error("");
  console.error("HOOK MORTO OU PELA METADE:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log("");
console.log("✓ o hook existe, invoca o trilho no indice, e chega inteiro num clone");
