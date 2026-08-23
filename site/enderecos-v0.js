/* LIVRO-RAZAO DA LINHA V0 · Triviu · Polygon PoS (chain 137)
 * ==========================================================
 *
 * GERADO de contracts/deployments/137.json por scripts/gerar-enderecos-v0.mjs.
 * NAO EDITE A MAO.
 *
 * POR QUE EXISTE, JA HAVENDO site/enderecos.js: aquele e o livro da linha
 * ANTIGA — ParameterRegistry, TriviuExecutor, GasTank, TriviuLPVault. Os seis
 * contratos da V0 nao estao la, e escrever os enderecos direto na tela criaria a
 * segunda fonte que o proprio livro antigo declara como reprovacao de aceite.
 *
 * A FONTE E A MESMA QUE O SOLIDITY LE. `Deployments.read(block.chainid, ...)`
 * abre este mesmo 137.json em UserFlow.s.sol, 03_SetBaseCurrency, 04_SetStrategy,
 * 08_Deposit e 09_Withdraw. Uma constante escrita aqui a mao poderia divergir do
 * que os scripts usam sem que nada avisasse — e divergiu uma vez, em 2026-08-22,
 * quando a moeda-base foi trocada no shell e o Solidity continuou lendo daqui.
 *
 * Medido na chain no bloco 92478492 (o genesis) e reconferido em 92496829.
 */
(function (raiz) {
  'use strict';

  var CHAIN = 137;

  var V0 = {
    /* ProtocolRegistry · curadoria de executor, moeda-base, taxa e pausa */
    protocolRegistry: '0x7D1D8EacA0ce96cFAb5937b88Ba5d43d7e0Ad8dC',
    /* ImplementationRegistry · quais implementacoes um cofre pode adotar */
    implementationRegistry: '0x660ca39A7fbC39dFD0ab4403ff3812519Ed4c0B0',
    /* TriviuVault v1 · a implementacao que todo proxy aponta */
    implementation: '0x5F5bFe6b6019beACFa95e9778917977881A19c7B',
    /* VaultFactory · createVault, e o CREATE2 que preve o endereco */
    factory: '0xF4e60C6Bf2c5479935abf1A9F82554E5CD2D843c',
    /* Executor · compartilhado por todos, nao e seu e voce nao o implanta */
    executor: '0x323C4192b269EA56aCd147dDbd3F71056E63E835',
    /* EscapeHatch · a saida incondicional */
    escapeHatch: '0x877c4BC26371bD835E48db6C2B11eB715333b490',
    /* USDC nativa · a moeda-base curada nesta implantacao */
    baseCurrency: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
  };

  /* A trava: quem consome endereco passa por aqui, e um endereco fora do livro
     falha alto. Case-insensitive de proposito — EIP-55 e checksum de digitacao,
     nao identidade, e reprovar por caixa ensinaria a contornar a trava. */
  var _baixo = {};
  Object.keys(V0).forEach(function (k) { _baixo[V0[k].toLowerCase()] = k; });

  function exigirV0(endereco, papelEsperado) {
    if (typeof endereco !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(endereco)) {
      throw new Error('[triviu/v0] nao e um endereco: ' + String(endereco));
    }
    var papel = _baixo[endereco.toLowerCase()];
    if (!papel) {
      throw new Error('[triviu/v0] DESCONHECIDO. ' + endereco + ' nao e nenhum dos ' +
        Object.keys(V0).length + ' enderecos da linha V0 na chain ' + CHAIN + '.');
    }
    if (papelEsperado && papel !== papelEsperado) {
      throw new Error('[triviu/v0] PAPEL TROCADO. ' + endereco + ' e o ' + papel +
        ', e o esperado era o ' + papelEsperado + '.');
    }
    return V0[papel];
  }

  var API = { CHAIN_ID: CHAIN, CHAIN_HEX: '0x89', V0: V0, exigirV0: exigirV0 };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (raiz) { raiz.TRIVIU_V0 = API; }
})(typeof window !== 'undefined' ? window : null);
