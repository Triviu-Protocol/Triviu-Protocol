#!/usr/bin/env node
/* PORTAO DO ALVO HONESTO  ·  a ponte pode recusar, nao pode fingir  ·  2026-08-20
 * ---------------------------------------------------------------------------
 * `site/alvos.json` e a saida da ponte do oraculo, servida em `connect-src 'self'`
 * e lida por `site/js/alvos.js` dentro do console. Ela e o unico arquivo do site
 * que o visitante le como AFIRMACAO SOBRE O MERCADO.
 *
 * A ponte foi bem desenhada: quando a decisao envelhece, ela RECUSA em vez de
 * servir alvo velho, e diz por que:
 *
 *     { "alvos": [], "assina": false, "motivoCodigo": "ORACULO_CEGO",
 *       "motivo": "a decisao tem 7.0h e o limite e 6h — o oraculo esta cego" }
 *
 * Isso e o comportamento certo e este portao NAO o proibe. Recusar nao e defeito.
 *
 * ===========================================================================
 * O QUE ELE PROIBE, E A ASSIMETRIA E O PONTO
 * ===========================================================================
 *
 * As duas direcoes de erro nao tem o mesmo peso:
 *
 *   RECUSAR SEM PRECISAR   custa uma tela vazia. Ninguem perde dinheiro.
 *   SERVIR SEM PODER       custa uma decisao de capital tomada sobre numero
 *                          que a propria ponte sabia estar velho.
 *
 * Entao este portao REPROVA a segunda e apenas REGISTRA a primeira:
 *
 *   1. `alvos` nao-vazio com `motivoCodigo` de recusa       -> REPROVA
 *   2. `assina: true` com `alvos` vazio                      -> REPROVA
 *   3. `assina: true` ou `monta_transacao: true`             -> REPROVA
 *      (a ponte NAO assina e NAO monta transacao — `oracle/decisao.mjs:18` e
 *       explicito, e `tests/bateria_decisao.mjs` reprova quem colar um signer.
 *       Se este arquivo disser que assina, alguem mudou o contrato da ponte sem
 *       mudar a ponte)
 *   4. `motivoCodigo` fora do rol fechado da ponte           -> REPROVA
 *      (a tela escreve uma frase por codigo; codigo novo cai no ramo generico e
 *       aparece esquisito em vez de sumir. "Aparece esquisito" e o piso, nao o
 *       alvo)
 *   5. `geradoEm` ausente, ilegivel ou NO FUTURO             -> REPROVA
 *   6. estrutura quebrada, JSON invalido, arquivo ausente    -> REPROVA
 *
 * E IMPRIME A IDADE, sempre, com nome. Cegueira silenciosa e o defeito que este
 * portao existe para tirar do silencio — mas quem faz o oraculo rodar e agenda,
 * nao portao. Ver `docs/PRDs/ONDA-TRIVIU-TRES-FRENTES-2026-08-20/handoffs/03`.
 *
 * ===========================================================================
 * O QUE ELE NAO PROVA
 * ===========================================================================
 *
 * Que os alvos estao CERTOS. Ele le a saida da ponte e cobra coerencia interna;
 * nao recalcula rota, nao consulta pool, nao valida lucro. Quem faz isso e o
 * oraculo, e quem o audita e a bateria dele.
 *
 * Tambem nao le PRODUCAO. Ele julga o arquivo do repositorio, que e o que o
 * proximo `vercel --prod` vai publicar. Quem olha producao e
 * `.github/workflows/vigia-oraculo.yml`.
 *
 *   --controle <json>   injeta um objeto SEM tocar o arquivo, so para provar que
 *                       o portao reprova.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALVO = join(RAIZ, "site", "alvos.json");
const PONTE_CEGO_APOS_HORAS = 6; // espelha `CEGO_APOS_HORAS` de oracle/ponte.mjs

/* ROL FECHADO, copiado de `oracle/ponte.mjs:74` — `export const MOTIVOS`.
   `triviu-engine` e PRIVADO e nao esta disponivel no CI deste repositorio, entao
   importar nao e opcao e a copia e inevitavel. A copia e conferida contra a fonte
   quando ela esta no disco (ver `conferirRolContraAPonte` abaixo).

   ESTA COPIA JA NASCEU ERRADA UMA VEZ, e o registro fica: a primeira versao deste
   arquivo listava SEM_ESTADO, ESTADO_ILEGIVEL, SEM_ALVO_LUCRATIVO e
   REDE_NAO_SUPORTADA — quatro codigos que NAO existem na ponte — e nao listava
   CARIMBO_ILEGIVEL, PORTAO_DE_REDE, TODOS_REPROVADOS nem ESTADO_INESPERADO, que
   existem. Foram escritos de memoria em vez de lidos da fonte. O portao teria
   reprovado quatro saidas legitimas e aceitado quatro impossiveis.

   Se a ponte ganhar um codigo e esta copia nao acompanhar, o portao reprova — e
   esse e o aviso certo, porque a TELA (`site/js/alvos.js`) tambem nao vai conhecer
   o codigo novo. */
const MOTIVOS = new Set([
  "SEM_DECISAO",
  "DECISAO_ILEGIVEL",
  "CARIMBO_ILEGIVEL",
  "ORACULO_CEGO",
  "PORTAO_DE_REDE",
  "TODOS_REPROVADOS",
  "ESTADO_INESPERADO",
]);

/* Codigos que significam "nao ha alvo para servir". Com um destes, `alvos` TEM de
   estar vazio. */
const RECUSAS = new Set([...MOTIVOS]);

/* Quando o repositorio do motor esta ao lado no disco — caso do operador, nunca do
   CI — a copia acima e conferida contra a fonte. Ausente, segue com a copia: um
   portao que exige repositorio privado para rodar nao roda em CI nenhum. */
function conferirRolContraAPonte() {
  const CANDIDATOS = [
    join(RAIZ, "..", "..", "triviu-engine", "oracle", "ponte.mjs"),
    join(RAIZ, "..", "triviu-engine", "oracle", "ponte.mjs"),
  ];
  for (const p of CANDIDATOS) {
    if (!existsSync(p)) continue;
    const m = /export const MOTIVOS = \[([\s\S]*?)\]/.exec(readFileSync(p, "utf8"));
    if (!m) return { estado: "fonte achada e rol nao reconhecido", p };
    const naFonte = [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]).sort();
    const naCopia = [...MOTIVOS].sort();
    const bate = naFonte.length === naCopia.length && naFonte.every((x, i) => x === naCopia[i]);
    return { estado: bate ? "bate" : "DIVERGE", p, naFonte, naCopia };
  }
  return { estado: "fonte ausente (normal no CI)" };
}

const argv = process.argv.slice(2).join(" ");
const mControle = /--controle\s+(\{.*\})\s*$/s.exec(argv);

let d, origem;
try {
  if (mControle) {
    d = JSON.parse(mControle[1]);
    origem = "CONTROLE INJETADO (o arquivo nao foi lido)";
  } else {
    if (!existsSync(ALVO)) {
      console.error(`portao do alvo honesto · site/alvos.json nao existe.`);
      console.error("  A ponte escreve este arquivo; sem ele o console fica sem fonte.");
      console.error("  FALHA FECHADA: portao que nao acha o alvo nao aprova.");
      process.exit(1);
    }
    d = JSON.parse(readFileSync(ALVO, "utf8"));
    origem = "site/alvos.json";
  }
} catch (e) {
  console.error("leitura falhou — FALHA FECHADA, nao 'passou':", e && e.message ? e.message : e);
  process.exit(1);
}

const falhas = [];
const alvos = Array.isArray(d.alvos) ? d.alvos : null;
const codigo = d.motivoCodigo ?? null;

if (alvos === null) falhas.push("`alvos` ausente ou nao e lista — a estrutura da ponte mudou sem avisar");

/* 3 · a ponte nao assina, e isso e contrato, nao preferencia */
if (d.assina === true)
  falhas.push(
    "`assina: true`. A ponte NAO assina: `oracle/decisao.mjs:18` diz \"NAO tem signer, " +
    "NAO tem chave, NAO monta transacao\", e `tests/bateria_decisao.mjs` reprova quem colar um. " +
    "Se este arquivo afirma que assina, o contrato da ponte foi rompido de um dos dois lados."
  );
if (d.monta_transacao === true)
  falhas.push("`monta_transacao: true` — mesma razao do campo `assina`.");

/* 4 · rol fechado */
if (codigo !== null && !MOTIVOS.has(codigo))
  falhas.push(
    `motivoCodigo "${codigo}" esta fora do rol fechado. A tela escreve uma frase por codigo; ` +
    "um codigo que ela nao conhece cai no ramo generico e APARECE esquisito em vez de sumir. " +
    `Rol: ${[...MOTIVOS].join(", ")}`
  );

/* 1 · a assimetria: recusar e ok, fingir nao e */
if (codigo && RECUSAS.has(codigo) && alvos && alvos.length > 0)
  falhas.push(
    `motivoCodigo "${codigo}" e recusa, e mesmo assim ha ${alvos.length} alvo(s) servido(s). ` +
    "A ponte estaria dizendo \"nao posso decidir\" e entregando decisao na mesma resposta. " +
    "Esta e a direcao cara do erro: capital movido sobre numero que a propria ponte sabia velho."
  );

/* 2 · o inverso incoerente */
if (d.assina === true && alvos && alvos.length === 0)
  falhas.push("`assina: true` com zero alvos — nao ha o que assinar.");

/* 5 · a idade */
let idadeHoras = null;
if (!d.geradoEm) {
  falhas.push("`geradoEm` ausente: sem ele ninguem sabe a idade do que esta sendo servido.");
} else {
  const t = Date.parse(d.geradoEm);
  if (Number.isNaN(t)) falhas.push(`\`geradoEm\` ilegivel: ${JSON.stringify(d.geradoEm)}`);
  else {
    idadeHoras = (Date.now() - t) / 3_600_000;
    if (idadeHoras < -0.05)
      falhas.push(
        `\`geradoEm\` esta no FUTURO (${idadeHoras.toFixed(2)}h). Relogio errado na origem, ` +
        "ou arquivo forjado. Nas duas hipoteses o campo deixa de servir para medir idade."
      );
  }
}

const rol = conferirRolContraAPonte();
if (rol.estado === "DIVERGE")
  falhas.push(
    `o rol de motivos DIVERGE da ponte (${rol.p}).
      copia: ${rol.naCopia.join(", ")}` +
    `
      fonte: ${rol.naFonte.join(", ")}`
  );

console.log("portao do alvo honesto · a ponte pode recusar, nao pode fingir");
console.log(`  origem ............. ${origem}`);
console.log(`  rol vs a ponte ..... ${rol.estado}`);
console.log(`  alvos servidos ..... ${alvos ? alvos.length : "(estrutura quebrada)"}`);
console.log(`  motivoCodigo ....... ${codigo ?? "(nenhum · ha alvo a servir)"}`);
console.log(`  assina ............. ${d.assina} · monta_transacao: ${d.monta_transacao}`);
console.log(
  `  idade da geracao ... ${idadeHoras === null ? "(desconhecida)" : idadeHoras.toFixed(1) + "h"}` +
  `  (a ponte cega em ${PONTE_CEGO_APOS_HORAS}h)`
);

/* O aviso alto que NAO reprova — e a razao esta dita, para ninguem confundir
   tolerancia com descuido. */
if (idadeHoras !== null && idadeHoras > PONTE_CEGO_APOS_HORAS) {
  console.log("");
  console.log(`  AVISO · a decisao tem ${idadeHoras.toFixed(1)}h e a ponte cega em ${PONTE_CEGO_APOS_HORAS}h.`);
  console.log("  O console esta servindo recusa, e recusa e o comportamento certo — por isso este");
  console.log("  portao nao reprova aqui. Quem tira o oraculo da cegueira e execucao agendada, e");
  console.log("  ela esta travada por tres coisas medidas, nao por falta de codigo:");
  console.log("    1. rpcPadrao da Polygon e null — o oraculo exige endpoint proprio (segredo)");
  console.log("    2. triviu-engine e PRIVADO e o site e PUBLICO — cruzar exige token");
  console.log("    3. o site NAO tem integracao git->Vercel — commitar alvos.json nao publica nada");
  console.log("  Ver o handoff 03 desta onda. Reprovar aqui trocaria uma tela honesta por um");
  console.log("  repositorio travado, sem fazer o oraculo rodar uma vez sequer.");
}

if (falhas.length) {
  console.error("\nA PONTE ESTA FINGINDO:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log("\n✓ a saida da ponte e coerente consigo mesma: nao promete o que declarou nao poder");
