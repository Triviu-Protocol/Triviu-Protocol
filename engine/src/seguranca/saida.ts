/**
 * A ÚNICA PORTA DE SAÍDA DO MOTOR.
 *
 * Por que um módulo e não um teste que procura o padrão errado:
 *
 * A primeira versão do portão era uma DENYLIST — enumerava as formas ruins
 * (`console.error(err)`, `${RPC}`) e procurava por elas. O red team plantou
 * cinco formas que um humano escreve naturalmente e o portão respondeu
 * "4 passed" depois de ler o arquivo:
 *
 *     console.error("falhou ao ler o cofre:", err);   erro no 2º argumento
 *     console.error(falha);                            outro nome de variável
 *     console.error(\n  err\n);                        quebrado em linhas
 *     console.error(`deu ruim: ${err}`);               dentro de template
 *     console.log("apontado para " + rpc);             concatenação
 *
 * Denylist perde para a forma que ninguém enumerou. E aquela tinha sido
 * calibrada só contra as mutações que restauravam o código original: aprendeu
 * exatamente as três formas que já estavam lá.
 *
 * A regra agora é o contrário: `console`, `process.stdout` e `process.stderr`
 * não existem em lugar nenhum do motor além deste arquivo. Não há como imprimir
 * sem passar por aqui, e tudo o que passa por aqui é redigido.
 */
import { erroParaLog, semUrl } from "./redigir.js";

/** Progresso normal. Redigido como todo o resto — nada sai cru daqui. */
export function info(...partes: readonly unknown[]): void {
  console.log(compor(partes));
}

/** Algo não respondeu, e seguimos sem chutar o valor. */
export function aviso(...partes: readonly unknown[]): void {
  console.warn(compor(partes));
}

/** A falha. Passa por `erroParaLog`, que prefere `shortMessage` e redige. */
export function falha(e: unknown): void {
  console.error(erroParaLog(e));
}

function compor(partes: readonly unknown[]): string {
  return partes.map(texto).join(" ");
}

function texto(v: unknown): string {
  if (typeof v === "string") return semUrl(v) ?? "";
  let bruto: string;
  try {
    /* `bigint` não serializa, e a exceção do viem carrega `bigint` — medido:
       `JSON.stringify` lança nela. Um erro ao imprimir apaga a única pista. */
    bruto = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) ?? String(v);
  } catch {
    try {
      bruto = String(v);
    } catch {
      return "[valor não imprimível]";
    }
  }
  return semUrl(bruto) ?? "";
}
