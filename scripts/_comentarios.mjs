/* TIRAR COMENTARIO SEM PERDER A LINHA  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Todo portao que varre JavaScript precisa ignorar o que esta em comentario —
 * um `style="x"` dentro de um bloco explicativo nunca chega ao DOM, e reprova-lo
 * seria falso positivo que ensina a ignorar o portao.
 *
 * A forma ingenua troca o bloco inteiro por um espaco:
 *
 *     s.replace(/\/\*[\s\S]*?\*\//g, " ")
 *
 * Os arquivos desta casa tem cabecalhos de 40 linhas. Um bloco desses vira UM
 * caractere, e todo `arquivo:linha` calculado dali em diante aponta dezenas de
 * linhas acima do defeito. Medido em 2026-08-19: o portao do F-3 acusava
 * `modelo-2.js:385` para uma violacao que esta na **422**. Trinta e sete linhas.
 *
 * Num portao que nunca reprovou, ninguem percebe. O numero errado so aparece no
 * dia em que ele morde — que e o pior dia possivel para descobrir que a
 * coordenada nao serve.
 *
 * ESTE ARQUIVO EXISTE PORQUE O ERRO SE REPETIU. A forma correta ja vivia em
 * `check-assinatura.mjs` desde antes; mesmo assim `check-alcance-dom`,
 * `check-sem-estilo-inline` e `check-console-abi` nasceram com a ingenua, cada
 * um redigitando o mesmo bug. Corrigir os tres seria consertar as instancias.
 * Um lugar so, importado por todos, conserta a CLASSE: o proximo portao a
 * nascer importa daqui em vez de redigitar.
 *
 * Cada caractere que sai vira espaco. Cada \n fica onde estava.
 */

const emBranco = (t) => t.replace(/[^\n]/g, " ");

/** Remove comentarios de JavaScript preservando a numeracao de linha. */
export const semComentarios = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, emBranco)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + emBranco(m.slice(p.length)));

/** Remove comentarios de HTML preservando a numeracao de linha. */
export const semComentariosHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, emBranco);

/* ---------------------------------------------------------------------------
 * FONTE NORMALIZADA · comentario fora, literais somados
 *
 * A ordem e canonica e nao e opcional: comentario primeiro, porque texto dentro
 * de comentario nao e codigo e somar literais la dentro inventaria ocorrencia
 * que o programa nao tem. Depois a soma, que e o que impede um `+` de esconder
 * `eth_sendTransaction` e `window.ethereum` de todos os guardioes desta casa —
 * furo provado por red team do Escorpiao em 2026-08-19, que passou pelos CINCO
 * portoes da onda de assinatura com nove linhas.
 *
 * Portao que varre fonte usa ISTO, nao `semComentarios` cru. O cru continua
 * exportado porque ha uso legitimo dele (contar linha, achar posicao no arquivo
 * original), mas para DECIDIR a resposta e esta.
 * ------------------------------------------------------------------------- */
import { dobrarLiterais } from "./_literais.mjs";

export function codigoNormalizado(src) {
  return dobrarLiterais(semComentarios(src));
}
