/**
 * LIVRO-RAZAO DOS ENDERECOS · Triviu · Polygon PoS (chain 137)
 * ============================================================
 *
 * FONTE UNICA. Nenhuma tela, painel, teste ou script escreve um endereco a mao.
 * Quem precisa de endereco importa daqui. Endereco duplicado em dois arquivos e
 * reprovacao de aceite (criterio 3 da ONDA-TRIVIU-MAINNET-FECHO).
 *
 * Tudo abaixo foi MEDIDO contra a chain no bloco 91859211, nao lido de log de
 * deploy — os logs nao chegaram a ser gravados. Os orfaos foram localizados por
 * `cast compute-address` sobre a janela de nonce do deployer e confirmados por
 * `eth_getCode`, metodo que nao depende de log nem de indexador.
 *
 * Este arquivo carrega tanto por <script src> (define window.TRIVIU_ENDERECOS)
 * quanto por import/require (module.exports), para servir HTML estatico e Node
 * a partir da MESMA fonte.
 */
(function (raiz) {
  'use strict';

  var CHAIN = 137;

  /* ---------------------------------------------------------------- VIVOS --
   * Os tres que o Executor vivo realmente usa. `registry` e IMMUTABLE dentro do
   * TriviuExecutor (TriviuExecutor.sol:95, fixado no construtor) — o Executor
   * abaixo esta preso a ESTE Registry para sempre e nao pode ser reapontado.
   */
  var VIVOS = {
    parameterRegistry: '0x1Adab61ef019d853BBcFaf65E929961b11897856',
    triviuExecutor:    '0xEdB5Aa01fd055B3755439cE41B92b575eea1d273',
    gasTank:           '0xFF0Dc2fC461E28bbAC7964496535989311e93f56',
    // Implantado 2026-08-12. Roteador COMPARTILHADO, nao um cofre por usuario:
    // a Factory instancia TriviuVault por dono e nao instancia LPVault nenhum.
    // O usuario detem a posicao (o mint usa recipient msg.sender e este contrato
    // nunca e ownerOf); o que e compartilhado e o roteador e a whitelist.
    triviuLPVault:     '0xC52BaD280809672D8EC5D1fcF2d7eCa45a2a423E'
  };

  /* --------------------------------------------------------------- ORFAOS --
   * Contratos vivos na chain, criados por runs de deploy que falharam depois.
   * Saldo zero nos tres.
   *
   * NAO CONFUNDA `saldo: 'zero'` COM "sem codigo". Todos os quatro TEM codigo
   * na chain agora. O do LPVault e GEMEO BYTE-EXATO do oficial: os dois tem 7954
   * bytes e o mesmo sha256 de runtime (601a48c28fe0c44f...). Ele aceita deposito
   * e cunha posicao que o Executor oficial NUNCA vai ler. Um rotulo anterior aqui
   * dizia `estado: 'VAZIO'`, e quem lesse concluiria "inofensivo" — por isso os
   * dois fatos agora sao campos separados, saldo e codigo.
   *
   * SOBRE A PARIDADE DE ESTADO: ela era verdade e DEIXOU DE SER. Enquanto o
   * Registry oficial estava sem configurar, os tres eram indistinguiveis por
   * estado. Medido em 2026-08-12, depois do setTreasury e do setFeeBps:
   *     oficial 0x1Adab61e  feeBps 3000  treasury Safe 0x73e344Be
   *     orfao   0x43DB0d57  feeBps 0     treasury 0x0
   * Hoje se distinguem em quatro campos. O paragrafo anterior afirmava o
   * contrario e fica registrado como o que foi: verdadeiro quando escrito,
   * falso depois de a matilha configurar o que ele descrevia.
   *
   * O PERIGO CONTINUA, e mudou de forma: agora um orfao se parece com um
   * Registry NOVO e nao-configurado, que e exatamente o que alguem esperaria
   * ver num deploy recente. So o endereco distingue com certeza. Ligar uma tela ao errado *parece* funcionar — le
   * politica plausivel, mostra aliquota zero — e o Executor vivo nunca vai
   * obedecer aquele Registry.
   *
   * Nao existe Executor orfao: os nonces 1677-1678 falharam antes de criar
   * codigo. Verificado, nao presumido.
   */
  var ORFAOS = [
    { endereco: '0x43DB0d57441Ee1F791989ED0EeC2C12eC76A2196', nonce: 1674, tipo: 'ParameterRegistry', saldo: 'zero', codigo: 2511 },
    { endereco: '0x41CbCd2C0C3564fBFA130C614d2c1F58dE8113D1', nonce: 1675, tipo: 'ParameterRegistry', saldo: 'zero', codigo: 2511 },
    { endereco: '0x9ABa958EaC3649925378EfC7a7DBc573116E5d31', nonce: 1676, tipo: 'GasTank',           saldo: 'zero', codigo: 777 },
    // 2026-08-12: o mesmo padrao outra vez, agora no LPVault. O deploy rodou
    // DUAS vezes (nonces 1686 e 1687) e os dois contratos sao gemeos funcionais
    // — mesmo registry, mesmo positionManager, mesmo MAX_FEE_BPS. So o
    // broadcast/run-latest distingue: ele registra 0xC52BaD28 como o oficial.
    // Aconteceu porque ninguem conferiu se o deploy ja havia rodado antes de
    // rodar de novo. Fica escrito para nao virar folclore.
    { endereco: '0xd224f7cE6f96c3D26737bD442B20F4f44992c440', nonce: 1686, tipo: 'TriviuLPVault',    saldo: 'zero', codigo: 7954, gemeoByteExato: true }
  ];

  /* ------------------------------------------------------------- EXTERNOS --
   * Contratos que NAO sao nossos e que mesmo assim entram em calldata assinada
   * por um usuario. Sao poucos e sao nomeados aqui pela mesma razao pela qual os
   * nossos sao: um endereco que vai para dentro de uma transacao ou sai do livro
   * ou e comparado byte-a-byte contra ele.
   *
   * Nao vivem em VIVOS porque nao sao Triviu, e exigirVivo() continua recusando
   * cada um deles — misturar os dois conjuntos faria `exigirVivo(NPM)` passar, e
   * ai a pergunta "este endereco e nosso?" deixaria de ter resposta.
   *
   * MEDIDO na chain 137 em 2026-08-13, e nao copiado de documentacao:
   *     TriviuLPVault.positionManager() -> 0xC36442b4a4522E871399CD717aBDD847Ab11FE88
   *     name()    "Uniswap V3 Positions NFT-V1"
   *     symbol()  "UNI-V3-POS"
   *     factory() 0x1F98431c8aD98523631AE4a59f267346ea31F984
   *     codigo    24384 bytes
   *
   * POR QUE A COMPARACAO E NECESSARIA MESMO SENDO O PONTEIRO IMMUTABLE:
   * `positionManager` e immutable no TriviuLPVault (TriviuLPVault.sol:186), logo
   * o cofre oficial nao pode ser reapontado. Isso torna a leitura confiavel
   * DEPOIS de se saber que se leu o cofre certo — e o orfao 0xd224f7cE responde
   * a MESMA pergunta com a MESMA resposta (medido). Ler positionManager() de um
   * cofre qualquer nao identifica nada; o que identifica e o par: cofre saido do
   * livro E resposta igual a esta constante.
   */
  var EXTERNOS = {
    uniswapPositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'
  };

  /* -------------------------------------------------------------- CUSTODIA --
   * Escrito como foi MEDIDO, nao como foi pretendido.
   *
   * O Safe 0x73e344... e um Gnosis Safe 1.4.1 de verdade, threshold 1, e o seu
   * UNICO dono e 0xb5Fb0CDa... — exatamente o EOA que assinou o deploy e que
   * hoje ainda e o owner() do Registry.
   *
   * Consequencia dita sem enfeite: transferir a posse move o controle da chave K
   * para um cofre controlado exclusivamente pela chave K. NAO HA SEPARACAO DE
   * CHAVE HOJE. O que o acceptOwner() entrega de real e ESTABILIDADE DE
   * ENDERECO — subir para 2/3 ou instalar timelock depois nao exige nova
   * transferencia de posse.
   *
   * Raio de explosao se a chave for comprometida, medido contra o codigo e nao
   * estimado: o portao atomico do Executor exige
   *     finalBalance >= startBalance + principal + minProfit
   * logo o PRINCIPAL DO USUARIO E INALCANCAVEL. O teto do atacante e
   * MAX_FEE_BPS = 5000 (50% do lucro) mais captura de spread limitada pelo
   * minProfit que o proprio usuario assina.
   */
  var CUSTODIA = {
    safe: '0x73e344Be290c0D53Badbe528e45877296F6dAf6E',
    safeVersao: '1.4.1',
    safeThreshold: 1,
    safeDonos: ['0xb5Fb0CDaab5784cBE05CcB9D843DaFe4663883C5'],
    deployer: '0xb5Fb0CDaab5784cBE05CcB9D843DaFe4663883C5',
    separacaoDeChave: false,
    timelock: null
    /* ownerAtual, pendingOwner e aceiteConcluido SAIRAM daqui em 2026-08-12.
       Eles diziam owner = EOA e aceiteConcluido = false; a chain respondia
       owner() = Safe e pendingOwner() = 0x0 desde que a posse foi aceita. Ou
       seja: estavam MENTINDO, e ninguem notou porque constante nao avisa que
       envelheceu. Posse e ESTADO DE CHAIN. Constante que espelha estado de
       chain e uma afirmacao com prazo de validade que ninguem anota — quem
       precisa do dado le owner() na hora. O que fica aqui e o que NAO expira:
       o Safe e 1-de-1 e o dono unico dele e o proprio deployer, logo nao ha
       separacao de chave, e isso nao muda sozinho. */
  };

  var MEDICAO = { chainId: CHAIN, bloco: 91859211, onda: 'ONDA-TRIVIU-MAINNET-FECHO-2026-08-11' };

  /* ---------------------------------------------------------------- TRAVA --
   * Criterio 4 do aceite: ligacao certa POR SORTE nao conta. Quem consome
   * endereco passa por aqui, e um endereco fora dos tres vivos falha alto.
   *
   * Case-insensitive de proposito: EIP-55 e checksum de digitacao, nao
   * identidade. Dois textos com caixa diferente sao o MESMO contrato, e uma
   * trava que reprovasse por caixa ensinaria a contornar a trava.
   */
  var _vivosBaixo = {};
  Object.keys(VIVOS).forEach(function (k) { _vivosBaixo[VIVOS[k].toLowerCase()] = k; });

  var _orfaosBaixo = {};
  ORFAOS.forEach(function (o) { _orfaosBaixo[o.endereco.toLowerCase()] = o; });

  function exigirVivo(endereco, papelEsperado) {
    if (typeof endereco !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(endereco)) {
      throw new Error('[triviu/enderecos] nao e um endereco: ' + String(endereco));
    }
    var baixo = endereco.toLowerCase();

    var orfao = _orfaosBaixo[baixo];
    if (orfao) {
      throw new Error(
        '[triviu/enderecos] ORFAO. ' + endereco + ' e um ' + orfao.tipo +
        ' do run de deploy que falhou (nonce ' + orfao.nonce + '). O estado dele e ' +
        'identico ao do verdadeiro, entao ele parece funcionar e nunca sera lido ' +
        'pelo Executor vivo. O ' + orfao.tipo + ' correto e ' +
        // Mapa por tipo, e nao um ternario: com o ternario anterior o orfao do
        // LPVault teria recebido "o ParameterRegistry correto e ...". Guarda que
        // aponta o substituto errado e pior que guarda que nao aponta nenhum.
        ({ GasTank: VIVOS.gasTank,
           ParameterRegistry: VIVOS.parameterRegistry,
           TriviuLPVault: VIVOS.triviuLPVault,
           TriviuExecutor: VIVOS.triviuExecutor }[orfao.tipo] || '(nao mapeado)') + '.'
      );
    }

    var papel = _vivosBaixo[baixo];
    if (!papel) {
      throw new Error(
        '[triviu/enderecos] DESCONHECIDO. ' + endereco + ' nao e nenhum dos tres ' +
        'contratos vivos do Triviu na chain ' + CHAIN + '.'
      );
    }
    if (papelEsperado && papel !== papelEsperado) {
      throw new Error(
        '[triviu/enderecos] PAPEL TROCADO. ' + endereco + ' e o ' + papel +
        ', e o esperado era o ' + papelEsperado + '.'
      );
    }
    return VIVOS[papel];
  }

  var _externosBaixo = {};
  Object.keys(EXTERNOS).forEach(function (k) { _externosBaixo[EXTERNOS[k].toLowerCase()] = k; });

  /**
   * A mesma trava de exigirVivo(), para os contratos de terceiros que entram em
   * calldata. Devolve a CONSTANTE, nunca o texto recebido, para que um chamador
   * que use o retorno esteja usando o livro mesmo quando leu de outro lugar.
   *
   * A divergencia ABORTA. Nao avisa, nao registra, nao continua com o que leu:
   * um endereco que nao bate e um endereco que ninguem revisou entrando numa
   * transacao que alguem vai assinar.
   */
  function exigirExterno(endereco, papelEsperado) {
    if (typeof endereco !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(endereco)) {
      throw new Error('[triviu/enderecos] nao e um endereco: ' + String(endereco));
    }
    var baixo = endereco.toLowerCase();

    var orfao = _orfaosBaixo[baixo];
    if (orfao) {
      throw new Error(
        '[triviu/enderecos] ORFAO. ' + endereco + ' e um ' + orfao.tipo +
        ' do run de deploy que falhou (nonce ' + orfao.nonce + '), e nao um contrato externo.'
      );
    }
    var nosso = _vivosBaixo[baixo];
    if (nosso) {
      throw new Error(
        '[triviu/enderecos] E NOSSO. ' + endereco + ' e o ' + nosso + ' do Triviu, e o esperado era o ' +
        'contrato externo ' + papelEsperado + '. Tratar um contrato nosso como externo apaga a unica ' +
        'distincao que importa quando se pergunta quem escreveu o codigo que vai executar.'
      );
    }

    var papel = _externosBaixo[baixo];
    if (!papel) {
      throw new Error(
        '[triviu/enderecos] EXTERNO DESCONHECIDO. ' + endereco + ' nao consta do livro. O ' +
        (papelEsperado || 'externo esperado') + ' e ' +
        (EXTERNOS[papelEsperado] || '(papel nao declarado no livro)') + '. ' +
        'Divergencia aqui ABORTA: este endereco entraria em calldata assinada.'
      );
    }
    if (papelEsperado && papel !== papelEsperado) {
      throw new Error(
        '[triviu/enderecos] PAPEL TROCADO. ' + endereco + ' e o externo ' + papel +
        ', e o esperado era o ' + papelEsperado + '.'
      );
    }
    return EXTERNOS[papel];
  }

  var API = {
    CHAIN_ID: CHAIN,
    VIVOS: VIVOS,
    ORFAOS: ORFAOS,
    EXTERNOS: EXTERNOS,
    CUSTODIA: CUSTODIA,
    MEDICAO: MEDICAO,
    exigirVivo: exigirVivo,
    exigirExterno: exigirExterno
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (raiz) { raiz.TRIVIU_ENDERECOS = API; }
})(typeof window !== 'undefined' ? window : null);
