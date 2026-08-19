/* DOBRA DE LITERAIS · o que o codigo DIZ depois de somar as strings  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Nasceu de um red team do Escorpiao que passou pelos CINCO portoes desta onda
 * com nove linhas:
 *
 *     var M = "eth_send" + "Transaction";
 *     var prov = window["eth" + "ereum"];
 *     prov.request({ method: M, params: [p] });
 *
 * Um arquivo que assina, le o slot da carteira direto, nao confere origem e nao
 * congela calldata — e nenhum guardiao o viu, porque todos procuravam as cadeias
 * `eth_sendTransaction` e `window.ethereum` escritas inteiras. O adversario nao
 * precisou de tecnica: precisou de um `+`.
 *
 * Este modulo normaliza a fonte ANTES da varredura, em duas passadas:
 *
 *   1. soma literais adjacentes   "a" + "b"       ->  "ab"   (ate estabilizar)
 *   2. acesso por chave literal   obj["prop"]     ->  obj.prop
 *
 * A ordem importa e nao e simetrica: `window["eth" + "ereum"]` so vira
 * `window.ethereum` porque a soma acontece primeiro.
 *
 * O QUE ELE NAO FAZ, dito para ninguem confundir com garantia: nao avalia
 * expressao dinamica de verdade. `window[atob("ZXRoZXJldW0=")]` continua
 * invisivel, e `w[k]` com `k` vindo de fora tambem. Isto nao e um interpretador;
 * e o fim do disfarce BARATO — o que custa um `+`. Contra o caro, a defesa e
 * outra e esta noutro arquivo: o rol fechado, onde arquivo que a pagina carrega
 * e nao esta classificado reprova. La esconder a intencao nao ajuda, porque a
 * omissao ja reprovou.
 *
 * As regras vem de literais de regex, nao de strings montadas a mao. A primeira
 * versao deste arquivo montava o padrao concatenando texto com barras invertidas
 * e chegou ao disco com as barras comidas pelo heredoc que o escreveu: a regex
 * ficou invalida e o modulo nao carregava. Literal de regex nao tem essa camada
 * de escape, entao o que se le e o que roda.
 */

const ASPA_DUPLA = /"(?:[^"\\\n]|\\.)*"/;
const ASPA_SIMPLES = /'(?:[^'\\\n]|\\.)*'/;
/* Crase SEM interpolacao. Template com ${...} fica de fora de proposito: somar
   duas partes de uma interpolacao mudaria o significado do codigo, e um portao
   que altera o sentido do que audita nao esta auditando. */
const CRASE = /`(?:[^`\\$]|\\.)*`/;

const LITERAL = "(?:" + ASPA_DUPLA.source + "|" + ASPA_SIMPLES.source + "|" + CRASE.source + ")";
const SOMA = new RegExp("(" + LITERAL + ")\\s*\\+\\s*(" + LITERAL + ")", "g");
const CHAVE_LITERAL = /\[\s*(["'])([A-Za-z_$][\w$]*)\1\s*\]/g;
const BARRA = String.fromCharCode(92);

const conteudo = (lit) => lit.slice(1, -1);

export function dobrarLiterais(src) {
  let s = src;
  /* Passada 1 · soma ate estabilizar. O teto existe porque regex sobre fonte
     hostil nao merece confianca ilimitada: 40 e folgado para qualquer cadeia
     honesta e curto para um laco patologico. */
  for (let i = 0; i < 40; i++) {
    const antes = s;
    s = s.replace(SOMA, (todo, a, b) => {
      /* So soma quando as duas pontas usam a mesma especie de aspa e nenhuma
         carrega escape — juntar `"a\\"` com `"b"` mudaria o que o codigo diz, e
         este modulo normaliza a leitura, nao reescreve o programa. */
      if (a[0] !== b[0]) return todo;
      if (a.indexOf(BARRA) >= 0 || b.indexOf(BARRA) >= 0) return todo;
      return a[0] + conteudo(a) + conteudo(b) + a[0];
    });
    if (s === antes) break;
  }
  /* Passada 2 · chave literal vira propriedade quando o nome e um identificador
     valido. `o["a-b"]` fica como esta: nao existe `.a-b`. */
  return s.replace(CHAVE_LITERAL, ".$2");
}
