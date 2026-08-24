/**
 * PORTÃO DE FONTE · o que impede o defeito de voltar.
 *
 * A varredura do motor achou sete superfícies por onde a chave do RPC saía, e
 * quatro delas eram o MESMO `console.error(err)` recebendo erros propagados. Se
 * o conserto for só nas sete, o oitavo `console.error(err)` que alguém escrever
 * reabre tudo — e ninguém vai lembrar por quê.
 *
 * Este teste lê o FONTE do motor. Não é elegante; é o que sobrevive a quem não
 * leu esta onda.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * A RAIZ inteira do motor, não `src` e `scripts` nomeados.
 *
 * A versão anterior varria as duas pastas, e a cobertura era 13 de 13 — completa
 * para o código que existia. O cego era a raiz do motor, que é exatamente onde
 * esta matilha larga arquivo: nesta onda passaram por `engine/` os rascunhos
 * `tb8.mts`, `ataque.mts`, `poc.mts`, `prova.mts` e `sonda-*.mts`. Todos foram
 * removidos — mas rascunho vira código permanente, e um portão que protege duas
 * pastas nomeadas defende o que existe, não o que vem.
 */
function arquivosDoMotor(): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === "dist" || nome.startsWith(".")) continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.m?ts$/.test(nome) && !/\.test\.m?ts$/.test(nome)) achados.push(caminho);
    }
  };
  andar(RAIZ);
  return achados;
}

/** Tira comentários antes de medir — comentário engana regex, e já enganou. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** O único arquivo do motor autorizado a tocar em saída. */
const PORTA_DE_SAIDA = "src/seguranca/saida.ts";

const caminhoRelativo = (c: string) => relative(RAIZ, c).split(sep).join("/");

describe("portão de fonte · a chave do RPC não volta para o log", () => {
  const arquivos = arquivosDoMotor();

  it("o território existe — senão este portão não mede nada", () => {
    expect(arquivos.length, "nenhum arquivo varrido: o caminho quebrou").toBeGreaterThanOrEqual(10);
  });

  it("COBERTURA · um arquivo na RAIZ do motor é visto", () => {
    /* Não basta afirmar que a varredura mudou: um `.ts` largado em `engine/` —
       que é onde os rascunhos desta matilha aparecem — tem de ser varrido. O
       arquivo é criado e removido aqui mesmo, e o `finally` garante que ele não
       sobreviva a uma falha. */
    const plantado = join(RAIZ, "zz-portao-cobertura.ts");
    try {
      writeFileSync(plantado, "export const x = 1;\n", "utf8");
      const vistos = arquivosDoMotor().map(caminhoRelativo);
      expect(vistos, "a raiz do motor está fora da varredura").toContain("zz-portao-cobertura.ts");
    } finally {
      rmSync(plantado, { force: true });
    }
  });

  it("a porta de saída existe no território varrido", () => {
    /* Se o arquivo for renomeado e este teste não acompanhar, o portão passaria
       a proibir TUDO e alguém o desligaria em vez de consertar. */
    expect(arquivos.map(caminhoRelativo)).toContain(PORTA_DE_SAIDA);
  });

  /* ── A REGRA · allowlist ───────────────────────────────────────────────────
     A primeira versão deste portão era uma DENYLIST: enumerava as formas ruins
     e procurava por elas. O red team plantou cinco formas naturais e o portão
     respondeu "4 passed" DEPOIS de ler o arquivo:

         console.error("contexto:", err);      erro no 2º argumento
         console.error(falha);                 outro nome de variável
         console.error(\n  err\n);             quebrado em linhas
         console.error(`deu ruim: ${err}`);    dentro de template
         console.log("apontado para " + rpc);  concatenação

     Denylist perde para a forma que ninguém enumerou. A regra agora é o
     contrário: os identificadores de saída não existem fora da porta. Não há
     como imprimir sem escrever um deles. */
  it("REGRA · `console`, `process.stdout` e `process.stderr` só existem na porta de saída", () => {
    /* Os IDENTIFICADORES, não as chamadas: `const c = console; c.error(err)`
       nunca escreve `console.` e atravessaria uma regra sobre a chamada. */
    const saida = /\b(console|process\s*\.\s*stdout|process\s*\.\s*stderr)\b/;
    const culpados: string[] = [];
    for (const caminho of arquivos) {
      const rel = caminhoRelativo(caminho);
      if (rel === PORTA_DE_SAIDA) continue;
      semComentarios(readFileSync(caminho, "utf8")).split("\n").forEach((linha, i) => {
        if (saida.test(linha)) culpados.push(`${rel}:${i + 1}  ${linha.trim()}`);
      });
    }
    expect(
      culpados,
      `saída fora de ${PORTA_DE_SAIDA} — use info(), aviso() ou falha():\n${culpados.join("\n")}`,
    ).toEqual([]);
  });

  /* Os três abaixo são a SEGUNDA camada. Não são a defesa — a regra acima é.
     Ficam porque custam nada e pegam o caso óbvio com mensagem mais direta. */
  it("segunda camada · nenhum `console.*` recebe um erro cru", () => {
    /* `console.error(err)` · `console.log(e)` · `console.error(String(err))` —
       qualquer variável cujo nome diga que é erro, entregue crua ao console. */
    const cru = /console\.\w+\(\s*(?:String\(\s*)?\b(err|error|e|erro|ex)\b\s*\)?\s*[,)]/;
    const culpados: string[] = [];
    for (const caminho of arquivos) {
      const linhas = semComentarios(readFileSync(caminho, "utf8")).split("\n");
      linhas.forEach((linha, i) => {
        if (cru.test(linha)) culpados.push(`${relative(RAIZ, caminho)}:${i + 1}  ${linha.trim()}`);
      });
    }
    expect(culpados, `erro cru no console — use erroParaLog():\n${culpados.join("\n")}`).toEqual([]);
  });

  it("segunda camada · nada interpola uma URL de configuração direto no log", () => {
    /* O pior achado da varredura não foi caminho de erro: era
       `console.log(\`Fork alive at block ${b} (${RPC})\`)`, que publicava a chave
       quando dava CERTO. */
    const interpolaUrl = /console\.\w+\([^)]*\$\{\s*(?:RPC|rpcUrl|params\.network\.rpcUrl|process\.env\[[^\]]*RPC[^\]]*\])\s*\}/;
    const culpados: string[] = [];
    for (const caminho of arquivos) {
      const linhas = semComentarios(readFileSync(caminho, "utf8")).split("\n");
      linhas.forEach((linha, i) => {
        if (interpolaUrl.test(linha)) culpados.push(`${relative(RAIZ, caminho)}:${i + 1}  ${linha.trim()}`);
      });
    }
    expect(culpados, `URL de RPC impressa direto — use origemDe():\n${culpados.join("\n")}`).toEqual([]);
  });

  it("a redação vive num lugar só — ninguém redefine `semUrl`", () => {
    /* Cópia em N arquivos é a classe voltando: a segunda cópia envelhece
       sozinha e ninguém percebe qual das duas o caminho real usa. */
    const define = /^\s*(?:export\s+)?function\s+semUrl\b/m;
    const donos = arquivos
      .filter((c) => define.test(semComentarios(readFileSync(c, "utf8"))))
      .map(caminhoRelativo);
    expect(donos).toEqual(["src/seguranca/redigir.ts"]);
  });
});
