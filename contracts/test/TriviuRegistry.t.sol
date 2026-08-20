// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/*  TESTE DO TriviuRegistry E DA TriviuFactory  ·  2026-08-20
    ---------------------------------------------------------------------------
    OS DOIS JUNTOS PORQUE SO EXISTEM JUNTOS

    O construtor do Registry faz `new TriviuFactory(address(this))`: a fabrica
    nasce dentro dele, ja apontada para ele, na MESMA transacao. E a fabrica recusa
    qualquer origem que nao seja o Registry. Nao ha como exercitar uma sem a outra,
    e testar a fabrica isolada testaria um contrato que nao existe sozinho na chain.

    O QUE ELE COBRE, por risco

      1. `implantarCofre` NAO TEM PARAMETRO DE DONO. O contrato documenta por que:
         "parametro de dono e o que permitiria implantar cofre no nome de outra
         pessoa". Aqui isso vira teste: o dono e sempre `msg.sender`, para qualquer
         chamador, sempre.

      2. A fabrica so obedece ao Registry. Isso ja foi provado NA CHAIN por
         eth_call de 0x..dEaD, que reverteu `NaoEOregistro` — esta suite prende o
         comportamento no bytecode, para que ele nao dependa de alguem repetir a
         medicao.

      3. Registro e requisito, whitelist e requisito, duplicata e recusada.

      4. O cofre nasce COMANDADO pela cerca, e a cerca nasce pausada. `depositar` e
         `sacar` nao dependem dela — a saida funciona desde o primeiro bloco.

    O QUE ELE NAO E
    Auditoria de seguranca. Escrever teste e Art. 1 da Pantera; auditar e do
    Tubarao-branco, vetar vulneravel e da Medusa (Art. 5).
*/

import {Test} from "forge-std/Test.sol";
import {TriviuRegistry} from "../src/TriviuRegistry.sol";
import {TriviuFactory} from "../src/TriviuFactory.sol";
import {TriviuVault} from "../src/TriviuVault.sol";

/// @dev Parametros mock com whitelist controlavel pelo teste.
contract ParametrosFalsos {
    mapping(address => bool) public permitido;

    function permitir(address token, bool v) external {
        permitido[token] = v;
    }

    function isAllowedToken(address token) external view returns (bool) {
        return permitido[token];
    }
}

contract MoedaMuda {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function approve(address g, uint256 q) external returns (bool) {
        allowance[msg.sender][g] = q;
        return true;
    }

    function transfer(address p, uint256 q) external returns (bool) {
        balanceOf[msg.sender] -= q;
        balanceOf[p] += q;
        return true;
    }

    function transferFrom(address d, address p, uint256 q) external returns (bool) {
        allowance[d][msg.sender] -= q;
        balanceOf[d] -= q;
        balanceOf[p] += q;
        return true;
    }

    function mint(address p, uint256 q) external {
        balanceOf[p] += q;
    }
}

contract TriviuRegistryTest is Test {
    TriviuRegistry registro;
    TriviuFactory fabrica;
    ParametrosFalsos parametros;
    MoedaMuda usdc;
    MoedaMuda naoPermitida;

    address alice;
    address bob;

    function setUp() public {
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        parametros = new ParametrosFalsos();
        usdc = new MoedaMuda();
        naoPermitida = new MoedaMuda();
        parametros.permitir(address(usdc), true);

        registro = new TriviuRegistry(address(parametros));
        fabrica = registro.fabrica();
    }

    /* ====================================================================== */
    /*  1 · A FABRICA NASCE DENTRO DO REGISTRO E SO OBEDECE A ELE              */
    /* ====================================================================== */

    function test_FabricaNasceApontadaParaORegistro() public view {
        assertEq(fabrica.registro(), address(registro), "a fabrica aponta para o registro");
        assertEq(address(registro.parametros()), address(parametros));
        assertTrue(address(fabrica).code.length > 0, "a fabrica tem codigo");
    }

    /// Este e o mesmo comportamento que a matilha provou na chain por eth_call de
    /// 0x..dEaD. Aqui ele fica preso ao bytecode, e nao a uma medicao que alguem
    /// precisa lembrar de repetir.
    function test_RevertWhen_FabricaChamadaPorQualquerOutraOrigem() public {
        vm.expectRevert(
            abi.encodeWithSelector(TriviuFactory.NaoEOregistro.selector, alice, address(registro))
        );
        vm.prank(alice);
        fabrica.implantarCofre(alice, address(usdc));
    }

    function testFuzz_FabricaRecusaQualquerOrigemQueNaoSejaORegistro(address quem) public {
        vm.assume(quem != address(registro));
        vm.expectRevert(
            abi.encodeWithSelector(TriviuFactory.NaoEOregistro.selector, quem, address(registro))
        );
        vm.prank(quem);
        fabrica.implantarCofre(quem, address(usdc));
    }

    /* ====================================================================== */
    /*  2 · O DONO E SEMPRE msg.sender — nao ha parametro para forjar          */
    /* ====================================================================== */

    /// O contrato documenta: "parametro de dono e o que permitiria implantar cofre
    /// no nome de outra pessoa". Este teste prova que a alice nao consegue criar
    /// cofre no nome do bob nem querendo: o dono sai do `msg.sender`.
    function testFuzz_ODonoDoCofreESempreQuemChamou(address quem) public {
        vm.assume(quem != address(0));
        vm.assume(quem.code.length == 0); // EOA: nao reverte ao receber
        vm.startPrank(quem);
        registro.registrar();
        (address cofre,) = registro.implantarCofre(address(usdc));
        vm.stopPrank();

        assertEq(TriviuVault(cofre).dono(), quem, "o dono e quem chamou, sempre");
        assertEq(registro.cofreDe(quem, address(usdc)), cofre);
    }

    /* ====================================================================== */
    /*  3 · OS TRES REQUISITOS                                                 */
    /* ====================================================================== */

    function test_RevertWhen_ImplantarSemRegistrar() public {
        vm.expectRevert(abi.encodeWithSelector(TriviuRegistry.NaoRegistrado.selector, alice));
        vm.prank(alice);
        registro.implantarCofre(address(usdc));
    }

    function test_RevertWhen_BaseForaDaWhitelist() public {
        vm.startPrank(alice);
        registro.registrar();
        vm.expectRevert(
            abi.encodeWithSelector(TriviuRegistry.BaseNaoPermitida.selector, address(naoPermitida))
        );
        registro.implantarCofre(address(naoPermitida));
        vm.stopPrank();
    }

    function test_RevertWhen_RegistrarDuasVezes() public {
        vm.startPrank(alice);
        registro.registrar();
        vm.expectRevert(abi.encodeWithSelector(TriviuRegistry.JaRegistrado.selector, alice));
        registro.registrar();
        vm.stopPrank();
    }

    function test_RevertWhen_SegundoCofreNaMesmaBase() public {
        vm.startPrank(alice);
        registro.registrar();
        (address primeiro,) = registro.implantarCofre(address(usdc));
        vm.expectRevert(
            abi.encodeWithSelector(
                TriviuRegistry.CofreJaExiste.selector, alice, address(usdc), primeiro
            )
        );
        registro.implantarCofre(address(usdc));
        vm.stopPrank();
    }

    /// Duas bases distintas dao dois cofres. A duplicata e por PAR dono+base.
    function test_DoisCofresEmBasesDistintas() public {
        parametros.permitir(address(naoPermitida), true);
        vm.startPrank(alice);
        registro.registrar();
        (address a,) = registro.implantarCofre(address(usdc));
        (address b,) = registro.implantarCofre(address(naoPermitida));
        vm.stopPrank();
        assertTrue(a != b, "cofres distintos por base");
        assertEq(registro.totalDeCofres(), 2);
    }

    /* ====================================================================== */
    /*  4 · O QUE NASCE JUNTO                                                  */
    /* ====================================================================== */

    function test_OCofreNasceComandadoPelaCerca() public {
        vm.startPrank(alice);
        registro.registrar();
        (address cofre, address cerca) = registro.implantarCofre(address(usdc));
        vm.stopPrank();

        assertTrue(cerca != address(0), "a cerca vem junto");
        assertEq(TriviuVault(cofre).comandante(), cerca, "a cerca comanda o cofre desde o bloco 1");
        assertEq(registro.cercaDe(alice, address(usdc)), cerca);
    }

    /// A saida nao depende da cerca. Este e o mesmo fato que a home publica —
    /// "no ceiling, no delay, no one's approval" — verificado no cofre que o
    /// registro acabou de criar, e nao num cofre de laboratorio.
    function test_SaidaFuncionaNoCofreRecemCriado() public {
        vm.startPrank(alice);
        registro.registrar();
        (address cofre,) = registro.implantarCofre(address(usdc));
        vm.stopPrank();

        usdc.mint(cofre, 500);
        vm.prank(alice);
        TriviuVault(cofre).sacar(500);
        assertEq(usdc.balanceOf(alice), 500, "o dono saiu sem pedir nada a ninguem");
    }

    function test_EstadoDoRegistroDepoisDeUmCofre() public {
        assertEq(registro.totalDeCofres(), 0);
        assertFalse(registro.estaRegistrado(alice));

        vm.startPrank(alice);
        registro.registrar();
        assertTrue(registro.estaRegistrado(alice));
        registro.implantarCofre(address(usdc));
        vm.stopPrank();

        assertEq(registro.totalDeCofres(), 1);
        assertFalse(registro.estaRegistrado(bob), "registrar a alice nao registra o bob");
    }

    function test_RevertWhen_ConstruirRegistroComParametrosZero() public {
        vm.expectRevert(TriviuRegistry.EnderecoZerado.selector);
        new TriviuRegistry(address(0));
    }
}
