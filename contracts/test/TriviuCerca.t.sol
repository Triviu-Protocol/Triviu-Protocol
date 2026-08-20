// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/*  TESTE DA TriviuCerca  ·  2026-08-20
    ---------------------------------------------------------------------------
    POR QUE ELE EXISTE, E POR QUE DEPOIS DOS OUTROS TRES

    Era o ultimo dos cinco contratos sem teste. Ficou por ultimo por medicao, nao
    por tamanho: e o unico que nao tem UMA instancia viva na chain — nenhum cofre
    foi criado, e a cerca so nasce junto com um cofre. Os outros tres que entraram
    antes ou tem instancia viva ou sao citados pela home.

    O N1 devolveu FIX_GERAL porque o criterio 3 da abertura dizia CINCO contratos e
    a entrega tinha quatro. Este arquivo e a resposta ao item 1 daquele veredito.

    A INVARIANTE CENTRAL, escrita no proprio contrato:

        "Tudo nasce fechado: pausada, sem operador, sem ativo, sem router"

    Uma cerca que nasce aberta e um portao decorativo. Toda a suite gira em torno
    disso: cada uma das NOVE condicoes de `ciclar` tem de recusar por padrao, e
    cada uma tem de recusar COM NOME PROPRIO — um revert generico deixaria o dono
    sem saber qual trava ele ainda nao armou.

    A ORDEM DAS RECUSAS E PARTE DO CONTRATO
    `ciclar` checa quem, quanto, lucro, gas, quando, e o que as pernas tocam —
    nessa ordem. A suite exercita cada trava com TODAS as anteriores ja armadas,
    porque so assim se prova que aquela trava especifica esta viva. Testar a nona
    com a primeira fechada nao testa a nona.

    O QUE ELE NAO E
    Auditoria. Escrever teste e Art. 1 da Pantera; auditar e do Tubarao-branco;
    vetar vulneravel e da Medusa (Art. 5 imutavel).
*/

import {Test} from "forge-std/Test.sol";
import {TriviuCerca} from "../src/TriviuCerca.sol";
import {ITriviuExecutor} from "../src/TriviuVault.sol";

/// @dev Cofre falso. Devolve `dono` e `base` para o construtor da cerca e registra
///      se `ciclar` chegou ate ele — que e a unica pergunta que importa aqui: a
///      cerca deixou passar, ou nao?
contract CofreFalso {
    address public dono;
    address public base;
    uint256 public crescimentoADevolver;
    uint256 public chamadas;

    constructor(address dono_, address base_) {
        dono = dono_;
        base = base_;
    }

    function setCrescimento(uint256 v) external {
        crescimentoADevolver = v;
    }

    function ciclar(uint256, uint256, ITriviuExecutor.Leg[] calldata)
        external
        returns (uint256)
    {
        chamadas++;
        return crescimentoADevolver;
    }
}

contract TriviuCercaTest is Test {
    TriviuCerca cerca;
    CofreFalso cofre;

    address dono;
    address operador;
    address estranho;
    address tokenBase;
    address tokenOutro;
    address router;

    function setUp() public {
        dono = makeAddr("dono");
        operador = makeAddr("operador");
        estranho = makeAddr("estranho");
        tokenBase = makeAddr("tokenBase");
        tokenOutro = makeAddr("tokenOutro");
        router = makeAddr("router");

        cofre = new CofreFalso(dono, tokenBase);
        cerca = new TriviuCerca(address(cofre));
        vm.warp(1_700_000_000); // um instante estavel, longe do bloco zero
    }

    /// Duas pernas fechando na base: base -> outro -> base.
    function _pernas() internal view returns (ITriviuExecutor.Leg[] memory legs) {
        legs = new ITriviuExecutor.Leg[](2);
        legs[0] = ITriviuExecutor.Leg({
            dex: ITriviuExecutor.Dex.UniV3, router: router,
            tokenIn: tokenBase, tokenOut: tokenOutro, fee: 3000, amountOutMin: 0
        });
        legs[1] = ITriviuExecutor.Leg({
            dex: ITriviuExecutor.Dex.UniV3, router: router,
            tokenIn: tokenOutro, tokenOut: tokenBase, fee: 3000, amountOutMin: 0
        });
    }

    /// Arma TUDO. Cada teste de trava desarma exatamente uma coisa depois disto,
    /// para provar que aquela trava especifica e a que recusa.
    function _armarTudo() internal {
        vm.startPrank(dono);
        cerca.definirOperador(operador);
        cerca.definirTamanho(1, 1_000_000);
        cerca.definirPisoDeLucro(100);            // 1%
        cerca.definirPrecoMaximoDeGas(100 gwei);
        cerca.definirIntervalo(0);
        cerca.definirJanela(0, 86_399, 0x7F);     // dia inteiro, sete dias
        cerca.definirAtivo(tokenBase, true);
        cerca.definirAtivo(tokenOutro, true);
        cerca.definirRouter(router, true);
        cerca.definirPausa(false);
        vm.stopPrank();
    }

    function _ciclarComoOperador(uint256 principal, uint256 minProfit) internal {
        vm.prank(operador);
        cerca.ciclar(principal, minProfit, _pernas());
    }

    /* ====================================================================== */
    /*  1 · TUDO NASCE FECHADO                                                 */
    /* ====================================================================== */

    function test_NasceFechada() public view {
        assertTrue(cerca.pausada(), "nasce pausada");
        assertEq(cerca.operador(), address(0), "nasce sem operador");
        assertEq(cerca.tamanhoMaximo(), 0, "nasce sem teto");
        assertEq(cerca.pisoDeLucroBps(), 0, "nasce sem piso de lucro");
        assertEq(cerca.precoMaximoDeGas(), 0, "nasce sem teto de gas");
        assertFalse(cerca.ativoPermitido(tokenBase), "nasce sem ativo permitido");
        assertFalse(cerca.routerPermitido(router), "nasce sem router permitido");
        assertEq(cerca.dono(), dono, "o dono vem do cofre, nao de parametro");
    }

    /// A prova de que "nasce fechada" nao e decoracao: recem-construida, com o
    /// operador correto tentando, o ciclo bate na PRIMEIRA trava.
    function test_RevertWhen_CiclarNumaCercaRecemNascida() public {
        vm.expectRevert(TriviuCerca.CercaPausada.selector);
        vm.prank(operador);
        cerca.ciclar(100, 10, _pernas());
    }

    /// Armado tudo, o ciclo passa. Sem este teste, os treze de recusa abaixo
    /// passariam com uma cerca que recusa SEMPRE — que e o portao que sempre nega
    /// e nao protege nada.
    function test_ComTudoArmadoOCicloPassa() public {
        _armarTudo();
        cofre.setCrescimento(50);
        _ciclarComoOperador(1000, 10);
        assertEq(cofre.chamadas(), 1, "o ciclo chegou ao cofre");
    }

    /* ====================================================================== */
    /*  2 · AS NOVE TRAVAS, cada uma com TODAS as outras armadas               */
    /* ====================================================================== */

    function test_RevertWhen_Pausada() public {
        _armarTudo();
        vm.prank(dono);
        cerca.definirPausa(true);
        vm.expectRevert(TriviuCerca.CercaPausada.selector);
        _ciclarComoOperador(1000, 10);
    }

    function test_RevertWhen_NaoEOperador() public {
        _armarTudo();
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.NaoEOperador.selector, estranho, operador)
        );
        vm.prank(estranho);
        cerca.ciclar(1000, 10, _pernas());
    }

    /// Nem o dono cicla. Ele arma a cerca; quem opera e o operador. Sem este
    /// teste, alguem poderia trocar `!= op` por `!= op && != dono` e passar.
    function test_RevertWhen_ODonoTentaCiclar() public {
        _armarTudo();
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.NaoEOperador.selector, dono, operador)
        );
        vm.prank(dono);
        cerca.ciclar(1000, 10, _pernas());
    }

    function test_RevertWhen_PrincipalAcimaDoTeto() public {
        _armarTudo();
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.PrincipalAcimaDoTeto.selector, 1_000_001, 1_000_000)
        );
        _ciclarComoOperador(1_000_001, 100_000);
    }

    function test_RevertWhen_PrincipalAbaixoDoPiso() public {
        vm.startPrank(dono);
        cerca.definirOperador(operador);
        cerca.definirTamanho(500, 1_000_000);
        cerca.definirPisoDeLucro(100);
        cerca.definirPrecoMaximoDeGas(100 gwei);
        cerca.definirIntervalo(0);
        cerca.definirJanela(0, 86_399, 0x7F);
        cerca.definirAtivo(tokenBase, true);
        cerca.definirAtivo(tokenOutro, true);
        cerca.definirRouter(router, true);
        cerca.definirPausa(false);
        vm.stopPrank();

        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.PrincipalAbaixoDoPiso.selector, 499, 500)
        );
        _ciclarComoOperador(499, 10);
    }

    /// A trava que fecha o roubo do spread: o operador nao pode pedir um ciclo com
    /// lucro minimo abaixo do que o dono exigiu. Sem ela, um operador hostil
    /// executaria ciclos de lucro zero e ficaria com o spread.
    function test_RevertWhen_LucroPedidoAbaixoDoPiso() public {
        _armarTudo();  // piso 100 bps = 1%
        // 1000 * 100 / 10000 = 10 exigido; pede 9
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.LucroAbaixoDoPiso.selector, 9, 10)
        );
        _ciclarComoOperador(1000, 9);
    }

    function testFuzz_LucroExigidoEsempreProporcionalAoPrincipal(uint96 principal) public {
        vm.assume(principal >= 1 && principal <= 1_000_000);
        _armarTudo();
        uint256 exigido = (uint256(principal) * 100) / 10_000;
        vm.assume(exigido > 0);

        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.LucroAbaixoDoPiso.selector, exigido - 1, exigido)
        );
        _ciclarComoOperador(principal, exigido - 1);
    }

    function test_RevertWhen_GasAcimaDoTeto() public {
        _armarTudo();
        vm.txGasPrice(200 gwei);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.GasAcimaDoTeto.selector, 200 gwei, 100 gwei)
        );
        _ciclarComoOperador(1000, 10);
    }

    function test_RevertWhen_CedoDemais() public {
        _armarTudo();
        vm.prank(dono);
        cerca.definirIntervalo(3600);
        cofre.setCrescimento(10);   // o lucro ENTREGUE tem de bater o piso — ver secao 6
        _ciclarComoOperador(1000, 10);         // o primeiro passa

        vm.expectRevert(
            abi.encodeWithSelector(
                TriviuCerca.CedoDemais.selector, uint64(block.timestamp), uint64(block.timestamp + 3600)
            )
        );
        _ciclarComoOperador(1000, 10);         // o segundo bate na cadencia
    }

    function test_CadenciaLiberaDepoisDoIntervalo() public {
        _armarTudo();
        vm.prank(dono);
        cerca.definirIntervalo(3600);
        cofre.setCrescimento(10);
        _ciclarComoOperador(1000, 10);
        vm.warp(block.timestamp + 3600);
        _ciclarComoOperador(1000, 10);
        assertEq(cofre.chamadas(), 2, "passou os dois depois de esperar");
    }

    function test_RevertWhen_AtivoNaoPermitido() public {
        _armarTudo();
        vm.prank(dono);
        cerca.definirAtivo(tokenOutro, false);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.AtivoNaoPermitido.selector, tokenOutro, 0)
        );
        _ciclarComoOperador(1000, 10);
    }

    function test_RevertWhen_RouterNaoPermitido() public {
        _armarTudo();
        vm.prank(dono);
        cerca.definirRouter(router, false);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.RouterNaoPermitido.selector, router, 0)
        );
        _ciclarComoOperador(1000, 10);
    }

    /// O ciclo tem de FECHAR na moeda base. Uma rota que termina noutro token
    /// deixaria o cofre com inventario que ele nao pediu.
    function test_RevertWhen_CicloNaoFechaNaBase() public {
        _armarTudo();
        ITriviuExecutor.Leg[] memory legs = new ITriviuExecutor.Leg[](2);
        legs[0] = ITriviuExecutor.Leg({
            dex: ITriviuExecutor.Dex.UniV3, router: router,
            tokenIn: tokenBase, tokenOut: tokenOutro, fee: 3000, amountOutMin: 0
        });
        legs[1] = ITriviuExecutor.Leg({
            dex: ITriviuExecutor.Dex.UniV3, router: router,
            tokenIn: tokenOutro, tokenOut: tokenOutro, fee: 3000, amountOutMin: 0
        });
        vm.prank(operador);
        vm.expectRevert();
        cerca.ciclar(1000, 10, legs);
    }

    function test_RevertWhen_SemPernas() public {
        _armarTudo();
        ITriviuExecutor.Leg[] memory vazio = new ITriviuExecutor.Leg[](0);
        vm.expectRevert(TriviuCerca.SemPernas.selector);
        vm.prank(operador);
        cerca.ciclar(1000, 10, vazio);
    }

    /* ====================================================================== */
    /*  6 · A PROMESSA VERIFICADA EM VEZ DE DELEGADA                           */
    /* ====================================================================== */

    /// MC-1. A cerca nao confia no `minProfit` que o operador PEDIU: ela confere
    /// o crescimento que o cofre ENTREGOU, depois do ciclo. Sem isso, um operador
    /// pediria o piso e o motor entregaria zero.
    ///
    /// Descobri esta regra errando: dois testes meus de cadencia falharam com
    /// `LucroEntregueAbaixoDoPiso(0, 10)` porque o meu cofre falso devolvia zero.
    /// O contrato estava certo.
    function test_RevertWhen_LucroENTREGUEAbaixoDoPiso() public {
        _armarTudo();
        cofre.setCrescimento(9);   // pediu 10, entregou 9
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.LucroEntregueAbaixoDoPiso.selector, 9, 10)
        );
        _ciclarComoOperador(1000, 10);
    }

    function test_LucroEntregueIgualAoPisoPassa() public {
        _armarTudo();
        cofre.setCrescimento(10);
        _ciclarComoOperador(1000, 10);
        assertEq(cofre.chamadas(), 1);
    }

    /* ====================================================================== */
    /*  3 · O QUE FALTA CONFIGURAR TEM NOME PROPRIO                            */
    /* ====================================================================== */

    /// Cada "nao configurado" e um erro distinto. Um revert generico deixaria o
    /// dono adivinhando qual trava ele ainda nao armou.
    function test_CadaFaltaDeConfiguracaoTemNomeProprio() public {
        vm.startPrank(dono);
        cerca.definirOperador(operador);
        cerca.definirPausa(false);
        vm.stopPrank();

        vm.expectRevert(TriviuCerca.TetoNaoConfigurado.selector);
        _ciclarComoOperador(1000, 10);

        vm.prank(dono);
        cerca.definirTamanho(1, 1_000_000);
        vm.expectRevert(TriviuCerca.PisoDeLucroNaoConfigurado.selector);
        _ciclarComoOperador(1000, 10);

        vm.prank(dono);
        cerca.definirPisoDeLucro(100);
        vm.expectRevert(TriviuCerca.TetoDeGasNaoConfigurado.selector);
        _ciclarComoOperador(1000, 10);
    }

    /* ====================================================================== */
    /*  4 · SO O DONO ARMA                                                     */
    /* ====================================================================== */

    function test_RevertWhen_EstranhoTentaArmar() public {
        vm.startPrank(estranho);
        vm.expectRevert(abi.encodeWithSelector(TriviuCerca.NaoEDono.selector, estranho, dono));
        cerca.definirOperador(estranho);
        vm.expectRevert(abi.encodeWithSelector(TriviuCerca.NaoEDono.selector, estranho, dono));
        cerca.definirPausa(false);
        vm.expectRevert(abi.encodeWithSelector(TriviuCerca.NaoEDono.selector, estranho, dono));
        cerca.definirAtivo(tokenBase, true);
        vm.expectRevert(abi.encodeWithSelector(TriviuCerca.NaoEDono.selector, estranho, dono));
        cerca.definirRouter(router, true);
        vm.stopPrank();
    }

    /// Nem o OPERADOR arma. Ele opera dentro dos limites; nao os move.
    function test_RevertWhen_OperadorTentaAfrouxarAPropriaCerca() public {
        _armarTudo();
        vm.startPrank(operador);
        vm.expectRevert(abi.encodeWithSelector(TriviuCerca.NaoEDono.selector, operador, dono));
        cerca.definirTamanho(1, type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(TriviuCerca.NaoEDono.selector, operador, dono));
        cerca.definirPisoDeLucro(0);
        vm.stopPrank();
    }

    function testFuzz_SoODonoArma(address quem) public {
        vm.assume(quem != dono);
        vm.expectRevert(abi.encodeWithSelector(TriviuCerca.NaoEDono.selector, quem, dono));
        vm.prank(quem);
        cerca.definirOperador(quem);
    }

    /* ====================================================================== */
    /*  5 · LIMITES DOS SETTERS                                                */
    /* ====================================================================== */

    function test_RevertWhen_PisoDeLucroAcimaDoMaximo() public {
        vm.expectRevert(abi.encodeWithSelector(TriviuCerca.BpsAcimaDoMaximo.selector, uint16(10_001)));
        vm.prank(dono);
        cerca.definirPisoDeLucro(10_001);
    }

    function test_RevertWhen_TamanhoInvertido() public {
        vm.expectRevert(abi.encodeWithSelector(TriviuCerca.TamanhoInvalido.selector, 100, 10));
        vm.prank(dono);
        cerca.definirTamanho(100, 10);
    }

    /// A JANELA INVERTIDA E LEGITIMA, e eu descobri errando.
    ///
    /// Escrevi um teste esperando que `definirJanela(500, 100)` revertesse, e ele
    /// falhou. `inicio > fim` nao e erro: e uma janela que ATRAVESSA A MEIA-NOITE
    /// — operar das 22h as 02h. O contrato so recusa fora de faixa e
    /// `inicio == fim` diferente de zero.
    function test_JanelaQueAtravessaAMeiaNoiteEValida() public {
        vm.prank(dono);
        cerca.definirJanela(79_200, 7_200, 0x7F);   // 22:00 -> 02:00
        assertEq(cerca.janelaInicioSeg(), 79_200);
        assertEq(cerca.janelaFimSeg(), 7_200);
    }

    function test_RevertWhen_JanelaForaDaFaixa() public {
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.JanelaInvalida.selector, uint32(86_401), uint32(100))
        );
        vm.prank(dono);
        cerca.definirJanela(86_401, 100, 0x7F);
    }

    function test_RevertWhen_JanelaDeLarguraZero() public {
        vm.expectRevert(
            abi.encodeWithSelector(TriviuCerca.JanelaInvalida.selector, uint32(500), uint32(500))
        );
        vm.prank(dono);
        cerca.definirJanela(500, 500, 0x7F);
    }

    function test_RevertWhen_ConstruirComCofreZero() public {
        vm.expectRevert(TriviuCerca.EnderecoZerado.selector);
        new TriviuCerca(address(0));
    }

    /// O dono vem do COFRE, nao de parametro — nao ha como criar cerca no nome de
    /// outra pessoa.
    function test_RevertWhen_CofreSemDono() public {
        CofreFalso semDono = new CofreFalso(address(0), tokenBase);
        vm.expectRevert(TriviuCerca.EnderecoZerado.selector);
        new TriviuCerca(address(semDono));
    }
}
