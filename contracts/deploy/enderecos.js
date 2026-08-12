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
    gasTank:           '0xFF0Dc2fC461E28bbAC7964496535989311e93f56'
  };

  /* --------------------------------------------------------------- ORFAOS --
   * Contratos vivos na chain, criados por runs de deploy que falharam depois.
   * Saldo zero nos tres.
   *
   * O PERIGO NAO E O SALDO — e que os dois Registries orfaos tem estado
   * BYTE-IDENTICO ao verdadeiro: mesmo owner, mesmo pendingOwner, feeBps 0,
   * treasury 0x0. NAO HA COMO DISTINGUIR O CERTO DO ERRADO CONSULTANDO ESTADO.
   * So o endereco difere. Ligar uma tela ao errado *parece* funcionar — le
   * politica plausivel, mostra aliquota zero — e o Executor vivo nunca vai
   * obedecer aquele Registry.
   *
   * Nao existe Executor orfao: os nonces 1677-1678 falharam antes de criar
   * codigo. Verificado, nao presumido.
   */
  var ORFAOS = [
    { endereco: '0x43DB0d57441Ee1F791989ED0EeC2C12eC76A2196', nonce: 1674, tipo: 'ParameterRegistry', estado: 'VAZIO' },
    { endereco: '0x41CbCd2C0C3564fBFA130C614d2c1F58dE8113D1', nonce: 1675, tipo: 'ParameterRegistry', estado: 'VAZIO' },
    { endereco: '0x9ABa958EaC3649925378EfC7a7DBc573116E5d31', nonce: 1676, tipo: 'GasTank',           estado: 'VAZIO' }
  ];

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
    timelock: null,
    ownerAtual: '0xb5Fb0CDaab5784cBE05CcB9D843DaFe4663883C5',
    pendingOwner: '0x73e344Be290c0D53Badbe528e45877296F6dAf6E',
    aceiteConcluido: false
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
        (orfao.tipo === 'GasTank' ? VIVOS.gasTank : VIVOS.parameterRegistry) + '.'
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

  var API = {
    CHAIN_ID: CHAIN,
    VIVOS: VIVOS,
    ORFAOS: ORFAOS,
    CUSTODIA: CUSTODIA,
    MEDICAO: MEDICAO,
    exigirVivo: exigirVivo
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (raiz) { raiz.TRIVIU_ENDERECOS = API; }
})(typeof window !== 'undefined' ? window : null);
