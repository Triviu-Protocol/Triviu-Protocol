/* A LISTA NOMINAL DE GUARDIOES  ·  fonte unica  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Esta lista nasceu dentro de `portoes.mjs` como um PISO numerico: "no minimo N
 * portoes". Contar parecia bastar — apagar um guardiao derrubaria a contagem.
 *
 * Nao bastava. O Tubarao-branco apagou `check-alcance-dom.mjs` — o portao de
 * Lei #1 — pos um `check-zzz.mjs` inerte no lugar, e o trilho imprimiu "OK 9
 * portoes passaram". Um numero e satisfeito por qualquer coisa que ocupe o
 * espaco. Virou lista de NOMES.
 *
 * Na passagem seguinte ele mostrou que um nome tambem se ocupa: manteve o nome
 * e esvaziou o corpo. Quem pega isso e `check-portoes-mordem.mjs`, que exige do
 * portao uma MORDIDA — e mordida nao se falsifica.
 *
 * A lista mora aqui, e nao dentro de um dos dois, porque os dois precisam dela:
 * o trilho para cobrar presenca, o corpus para cobrar cobertura. Duas copias da
 * mesma lista sairiam de sincronia no primeiro guardiao novo, e a que
 * envelhecesse seria justamente a que ninguem le.
 *
 * Guardiao novo entra sozinho pela descoberta do trilho e NAO precisa ser
 * listado aqui — a lista existe para impedir REMOCAO silenciosa, nao para
 * autorizar adicao. Mas o corpus cobra cobertura de tudo que esta aqui: pos o
 * nome, deve o controle.
 */
export const OBRIGATORIOS = [
  "check-alcance-dom.mjs",
  "check-arvore-publicavel.mjs",
  "check-assinatura.mjs",
  "check-console-abi.mjs",
  "check-csp.mjs",
  "check-duas-fontes.mjs",
  "check-enderecos-drift.mjs",
  "check-hook-vivo.mjs",
  "check-multichain-honesty.mjs",
  "check-origem-unica.mjs",
  "check-pausa-fora-da-tela.mjs",
  "check-provedor-unico.mjs",
  "check-portoes-mordem.mjs",
  "check-procedencia-byte.mjs",
  "check-regra6-magnitude.mjs",
  "check-sem-estilo-inline.mjs",
  "check-tesouraria-viva.mjs",
];
