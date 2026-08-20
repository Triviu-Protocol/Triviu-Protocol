/* QUEM ASSINA · uma lista, um lugar  ·  2026-08-20
 * ---------------------------------------------------------------------------
 * Esta lista existia em DOIS arquivos, e eles não se falavam:
 *
 *     check-assinatura.mjs      ASSINANTES  +  ROL_JS       (viva)
 *     check-alcance-dom.mjs:87  ASSINANTES_REL              (cravada à mão)
 *
 * O Escorpião isolou a consequência com um rename rotineiro — `console.js` para
 * `calldata.js`, atualizado no HTML e no guardião de assinatura:
 *
 *     antes:  telas: calldata, console   ·  151 ids
 *     depois: telas: console             ·   93 ids
 *             "✓ nenhum script fora do motor escreve na subarvore que assina"
 *
 * O portão de alcance de DOM perdeu a tela onde o cartão da transação é
 * desenhado e imprimiu o visto. `check-assinatura` passou, porque o arquivo
 * renomeado estava conforme.
 *
 * É a DÉCIMA aparição da mesma classe nesta onda, e a primeira na forma "duas
 * fontes da mesma verdade" — as nove anteriores foram recorte, lista de nomes,
 * extensão, diretório, prefixo. O remédio é o mesmo de sempre: uma resposta, um
 * lugar que responde.
 *
 * ===========================================================================
 * O QUE A GRAVIDADE ERA, e não é o rename
 * ===========================================================================
 *
 * Cinco portões citavam o nome de um assinante. Três reagiam bem ao rename —
 * dois falhavam FECHADO (recusavam) e dois DESCOBRIAM (imunes). Só o
 * `check-alcance-dom`, que carrega VETO de Lei #1, falhava ABERTO: perdia
 * cobertura em silêncio e afirmava o contrário.
 *
 * Portão que perde alvo tem de RECUSAR, nunca aprovar com menos alvos. É por
 * isso que, além desta fonte única, o `check-alcance-dom` passou a cobrar um
 * piso de cobertura: ver `_cobertura-minima.json`.
 */

/* Arquivos que alcançam a carteira e podem ENVIAR. Cada um passa pelas quatro
   checagens do `check-assinatura`; cada página que carrega um deles é, por
   definição, uma tela que assina. */
export const ASSINANTES = [
  "js/console.js",     /* /calldata/ — o leitor de bytes do ciclo do Executor */
  "js/console-lp.js",  /* /console/  — o ciclo de vida de uma posicao no LPVault */
];
