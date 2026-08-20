// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/*  TESTE DO TriviuVault  ·  2026-08-20
    ---------------------------------------------------------------------------
    POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE EXISTE AGORA

    Ate hoje o `TriviuVault` era um dos CINCO contratos sem teste nenhum. Em
    2026-08-20 a home do triviu.vercel.app passou a exibir, como prova ao
    visitante, a linha:

        function sacar(uint256) external soDono
        // no ceiling, no delay, no one's approval

    Publicamos uma garantia sobre um contrato que nenhum teste exercitava. Este
    arquivo fecha essa distancia: cada afirmacao que a pagina faz vira aqui um
    teste que FALHA se o contrato deixar de cumpri-la.

    O QUE ELE COBRE, e a ordem e por risco, nao por linha
      1. a saida — `sacar` e do dono, e nao consulta mais nada
      2. a posse — `dono` e imutavel, sem caminho de transferencia
      3. o portao que queima — `definirComandanteInicial` so uma vez, so o criador
      4. a promessa em bytecode — `ciclar` reverte se o cofre encolher
      5. reentrancia — o guarda cobre as funcoes que movem valor
      6. os limites do construtor

    O QUE ELE NAO E
    Nao e auditoria de seguranca. Escrever teste e Art. 1 meu; auditar e do
    Tubarao-branco (Lei do Sangue) e vetar vulneravel e da Medusa (Art. 5). Um
    teste verde aqui nao diz "o contrato e seguro"; diz "o contrato faz o que a
    pagina afirma que ele faz".
*/

import {Test} from "forge-std/Test.sol";
import {TriviuVault, ITriviuExecutor} from "../src/TriviuVault.sol";

/* -------------------------------------------------------------------------- */
/*  Mocks — deliberadamente burros. Um mock esperto esconde o defeito do alvo.  */
/* -------------------------------------------------------------------------- */

contract MoedaBase {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @dev Interruptor para o teste de aprovacao recusada: alguns tokens
    ///      respondem `false` em vez de reverter, e o cofre checa o retorno.
    bool public recusaAprovacao;

    function setRecusaAprovacao(bool v) external {
        recusaAprovacao = v;
    }

    function mint(address para, uint256 q) external {
        balanceOf[para] += q;
    }

    function queimarDe(address de, uint256 q) external {
        balanceOf[de] -= q;
    }

    function approve(address gastador, uint256 q) external returns (bool) {
        if (recusaAprovacao) return false;
        allowance[msg.sender][gastador] = q;
        return true;
    }

    function transfer(address para, uint256 q) external returns (bool) {
        balanceOf[msg.sender] -= q;
        balanceOf[para] += q;
        return true;
    }

    function transferFrom(address de, address para, uint256 q) external returns (bool) {
        uint256 permitido = allowance[de][msg.sender];
        if (permitido != type(uint256).max) allowance[de][msg.sender] = permitido - q;
        balanceOf[de] -= q;
        balanceOf[para] += q;
        return true;
    }
}

/// @dev Motor que devolve o principal mais o lucro que o teste mandar. Com
///      `lucro` negativo (via `drenar`) ele ENCOLHE o cofre, que e o caso que a
///      verificacao de encolhimento existe para pegar.
contract MotorFalso {
    MoedaBase public moeda;
    int256 public delta;
    bool public naoDevolve;

    /// @dev Quanto do principal aprovado o motor DEIXA de gastar. Existe por causa
    ///      de um achado do N2: a primeira versao deste mock gastava exatamente o
    ///      principal, e `transferFrom` consumia a allowance inteira. O
    ///      `test_AprovacaoZeradaDepoisDoCiclo` media zero e concluia "foi zerada"
    ///      — quando o zero vinha do GASTO, nao do zeramento. Removendo
    ///      `_aprovaExato(m, 0)` do contrato, nenhum teste caia.
    ///      Com o motor gastando menos, a sobra so desaparece se alguem a zerar.
    uint256 public naoGasta;

    function setNaoGasta(uint256 v) external {
        naoGasta = v;
    }

    constructor(MoedaBase m) {
        moeda = m;
    }

    function setDelta(int256 d) external {
        delta = d;
    }

    function setNaoDevolve(bool v) external {
        naoDevolve = v;
    }

    function executeCycle(address, uint256 principal, uint256, ITriviuExecutor.Leg[] calldata) external {
        uint256 gasto = principal - naoGasta;
        moeda.transferFrom(msg.sender, address(this), gasto);
        if (naoDevolve) return;
        uint256 volta = delta >= 0 ? gasto + uint256(delta) : gasto - uint256(-delta);
        if (delta > 0) moeda.mint(address(this), uint256(delta));
        moeda.transfer(msg.sender, volta);
    }
}

/// @dev Reentra em `ciclar` durante a propria chamada do motor.
///
///      A PRIMEIRA VERSAO DESTE MOCK REENTRAVA EM `sacar`, E ERA INUTIL. `sacar`
///      carrega `soDono`, e o motor nao e o dono: a chamada revertia com
///      `NaoEDono` ANTES de chegar ao guarda de reentrancia. O teste afirmava "a
///      reentrada foi bloqueada" e nao tinha exercitado o guarda uma vez sequer —
///      provado por mutacao: tirar `naoReentrante` de `sacar` deixava os 27 testes
///      verdes.
///
///      Aqui o motor e posto como COMANDANTE, entao a checagem de autorizacao de
///      `ciclar` passa e a UNICA coisa que pode barrar a reentrada e o guarda. E o
///      erro capturado e conferido por seletor, nao "reverteu de algum jeito".
contract MotorReentrante {
    MoedaBase public moeda;
    TriviuVault public cofre;
    bool public tentou;
    bytes public motivoDaRecusa;

    ITriviuExecutor.Leg[] private _vazio;

    constructor(MoedaBase m) {
        moeda = m;
    }

    function apontar(TriviuVault c) external {
        cofre = c;
    }

    function executeCycle(address, uint256 principal, uint256, ITriviuExecutor.Leg[] calldata) external {
        if (!tentou) {
            tentou = true;
            try cofre.ciclar(1, 0, _vazio) {
                motivoDaRecusa = hex"";           // nao reverteu: o guarda falhou
            } catch (bytes memory motivo) {
                motivoDaRecusa = motivo;
            }
        }
        moeda.transferFrom(msg.sender, address(this), principal);
        moeda.transfer(msg.sender, principal);
    }
}

/* -------------------------------------------------------------------------- */

contract TriviuVaultTest is Test {
    TriviuVault cofre;
    MoedaBase moeda;
    address dono;
    address estranho;
    address comandante;

    ITriviuExecutor.Leg[] pernasVazias;

    function setUp() public {
        dono = makeAddr("dono");
        estranho = makeAddr("estranho");
        comandante = makeAddr("comandante");
        moeda = new MoedaBase();
        // `criador` = este contrato de teste, que e quem faz `new`
        cofre = new TriviuVault(dono, address(moeda));
    }

    function _abastecer(uint256 q) internal {
        moeda.mint(dono, q);
        vm.startPrank(dono);
        moeda.approve(address(cofre), q);
        vm.stopPrank();
        // deposito direto: o cofre le `base.balanceOf(address(this))`
        moeda.mint(address(cofre), q);
    }

    /* ====================================================================== */
    /*  1 · A SAIDA — o que a home publica como prova                          */
    /* ====================================================================== */

    /// A pagina diz "no one's approval". Aqui: motor AUSENTE, comandante AUSENTE,
    /// e o saque sai assim mesmo. Se alguem acoplar `sacar` a qualquer estado
    /// configuravel, este teste cai.
    function test_SacarNaoConsultaMotorNemComandante() public {
        _abastecer(100);
        assertEq(cofre.motor(), address(0), "o motor tem de estar ausente para o teste valer");
        assertEq(cofre.comandante(), address(0), "o comandante tem de estar ausente");

        vm.prank(dono);
        cofre.sacar(40);

        assertEq(moeda.balanceOf(dono), 100 + 40, "o dono recebeu o saque");
        assertEq(moeda.balanceOf(address(cofre)), 60, "o cofre foi debitado");
    }

    /// `soDono`. O erro nomeia quem chamou E quem e o dono — checo os dois, porque
    /// um revert generico deixaria passar um modificador trocado.
    function test_RevertWhen_SacarPorEstranho() public {
        _abastecer(100);
        vm.expectRevert(abi.encodeWithSelector(TriviuVault.NaoEDono.selector, estranho, dono));
        vm.prank(estranho);
        cofre.sacar(1);
    }

    /// Nem o comandante saca. Ele comanda ciclo; nao toca a saida.
    function test_RevertWhen_SacarPeloComandante() public {
        _abastecer(100);
        vm.prank(dono);
        cofre.definirComandante(comandante);

        vm.expectRevert(abi.encodeWithSelector(TriviuVault.NaoEDono.selector, comandante, dono));
        vm.prank(comandante);
        cofre.sacar(1);
    }

    /// "Sem teto": o dono saca o saldo inteiro numa chamada.
    function test_SacarSaldoInteiroSemTeto() public {
        _abastecer(1_000_000 ether);
        vm.prank(dono);
        cofre.sacar(1_000_000 ether);
        assertEq(moeda.balanceOf(address(cofre)), 0, "o cofre esvazia sem teto");
    }

    function test_RevertWhen_SacarMaisQueOSaldo() public {
        _abastecer(10);
        vm.expectRevert(abi.encodeWithSelector(TriviuVault.SaldoInsuficiente.selector, 11, 10));
        vm.prank(dono);
        cofre.sacar(11);
    }

    function test_RevertWhen_SacarZero() public {
        _abastecer(10);
        vm.expectRevert(TriviuVault.QuantiaZero.selector);
        vm.prank(dono);
        cofre.sacar(0);
    }

    /* ====================================================================== */
    /*  2 · A POSSE — `dono` e imutavel                                        */
    /* ====================================================================== */

    /// A pagina diz "fixed at construction". Provo pela ABI: nao existe funcao
    /// que escreva `dono`. Um setter novo mudaria o bytecode e este teste
    /// continuaria verde — por isso o teste seguinte tambem existe.
    function test_DonoFixadoNaConstrucao() public view {
        assertEq(cofre.dono(), dono, "dono e o do construtor");
        assertEq(cofre.criador(), address(this), "criador e quem fez new");
    }

    /// Se alguem acrescentar `transferirDono(address)`, esta chamada de baixo
    /// nivel deixa de reverter e o teste cai. E o guardiao da imutabilidade que
    /// um getter nao da.
    function test_NaoExisteCaminhoDeTransferirPosse() public {
        string[3] memory candidatos = [
            "transferirDono(address)",
            "transferOwnership(address)",
            "setDono(address)"
        ];
        for (uint256 i = 0; i < candidatos.length; i++) {
            (bool ok,) = address(cofre).call(abi.encodeWithSignature(candidatos[i], estranho));
            assertFalse(ok, candidatos[i]);
        }
        assertEq(cofre.dono(), dono, "a posse nao se moveu");
    }

    /* ====================================================================== */
    /*  3 · O PORTAO QUE QUEIMA                                                */
    /* ====================================================================== */

    function test_ComandanteInicialSoUmaVez() public {
        cofre.definirComandanteInicial(comandante);
        assertEq(cofre.comandante(), comandante);

        vm.expectRevert(TriviuVault.PortaoInicialQueimado.selector);
        cofre.definirComandanteInicial(estranho);
    }

    function test_RevertWhen_ComandanteInicialPorNaoCriador() public {
        vm.expectRevert(
            abi.encodeWithSelector(TriviuVault.NaoEOcriador.selector, estranho, address(this))
        );
        vm.prank(estranho);
        cofre.definirComandanteInicial(comandante);
    }

    /// O dono derruba um comandante hostil numa transacao — o "pior caso" que o
    /// proprio contrato documenta.
    function test_DonoDerrubaComandanteEmUmaTransacao() public {
        cofre.definirComandanteInicial(estranho);
        assertEq(cofre.comandante(), estranho);
        vm.prank(dono);
        cofre.definirComandante(comandante);
        assertEq(cofre.comandante(), comandante, "o dono retomou em uma chamada");
    }

    /* ====================================================================== */
    /*  4 · A PROMESSA EM BYTECODE — o cofre nao encolhe                       */
    /* ====================================================================== */

    /// O contrato documenta: "o cofre nao delega a sua unica promessa a um
    /// endereco que o dono pode trocar". Aqui o motor devolve MENOS do que levou,
    /// e o cofre reverte por conta propria.
    function test_RevertWhen_CicloEncolheOCofre() public {
        MotorFalso motor = new MotorFalso(moeda);
        motor.setDelta(-10);
        _abastecer(100);
        vm.startPrank(dono);
        cofre.definirMotor(address(motor));
        vm.expectRevert(abi.encodeWithSelector(TriviuVault.CofreEncolheu.selector, 100, 90));
        cofre.ciclar(50, 0, pernasVazias);
        vm.stopPrank();
    }

    /// Motor que engole o principal e nao devolve nada.
    function test_RevertWhen_MotorNaoDevolveNada() public {
        MotorFalso motor = new MotorFalso(moeda);
        motor.setNaoDevolve(true);
        _abastecer(100);
        vm.startPrank(dono);
        cofre.definirMotor(address(motor));
        vm.expectRevert(abi.encodeWithSelector(TriviuVault.CofreEncolheu.selector, 100, 50));
        cofre.ciclar(50, 0, pernasVazias);
        vm.stopPrank();
    }

    /// Empate e valido: zero de crescimento nao reverte.
    function test_CicloComEmpateNaoReverte() public {
        MotorFalso motor = new MotorFalso(moeda);
        motor.setDelta(0);
        _abastecer(100);
        vm.startPrank(dono);
        cofre.definirMotor(address(motor));
        uint256 cresc = cofre.ciclar(50, 0, pernasVazias);
        vm.stopPrank();
        assertEq(cresc, 0, "empate e zero, e zero passa");
    }

    function test_CicloComLucroDevolveCrescimento() public {
        MotorFalso motor = new MotorFalso(moeda);
        motor.setDelta(7);
        _abastecer(100);
        vm.startPrank(dono);
        cofre.definirMotor(address(motor));
        uint256 cresc = cofre.ciclar(50, 0, pernasVazias);
        vm.stopPrank();
        assertEq(cresc, 7);
        assertEq(moeda.balanceOf(address(cofre)), 107);
    }

    /// A aprovacao e zerada DEPOIS do ciclo. Allowance residual e superficie que
    /// ninguem fechou.
    /// O N2 derrubou a primeira versao deste teste: o motor gastava tudo, e a
    /// allowance zerava pelo gasto. Agora ele deixa 20 sem gastar — se
    /// `_aprovaExato(m, 0)` sair do contrato, a sobra fica viva e o teste cai.
    function test_AprovacaoZeradaDepoisDoCiclo() public {
        MotorFalso motor = new MotorFalso(moeda);
        motor.setDelta(1);
        motor.setNaoGasta(20);
        _abastecer(100);
        vm.startPrank(dono);
        cofre.definirMotor(address(motor));
        cofre.ciclar(50, 0, pernasVazias);
        vm.stopPrank();
        assertEq(moeda.allowance(address(cofre), address(motor)), 0, "sem allowance residual");
    }

    function test_RevertWhen_CiclarSemMotor() public {
        _abastecer(100);
        vm.expectRevert(TriviuVault.MotorAusente.selector);
        vm.prank(dono);
        cofre.ciclar(10, 0, pernasVazias);
    }

    function test_RevertWhen_CiclarPorEstranho() public {
        MotorFalso motor = new MotorFalso(moeda);
        _abastecer(100);
        vm.prank(dono);
        cofre.definirMotor(address(motor));

        vm.expectRevert(
            abi.encodeWithSelector(TriviuVault.NaoEComandante.selector, estranho, address(0))
        );
        vm.prank(estranho);
        cofre.ciclar(10, 0, pernasVazias);
    }

    /// O comandante PODE ciclar — e a unica coisa que ele pode.
    function test_ComandanteCicla() public {
        MotorFalso motor = new MotorFalso(moeda);
        motor.setDelta(0);
        _abastecer(100);
        vm.startPrank(dono);
        cofre.definirMotor(address(motor));
        cofre.definirComandante(comandante);
        vm.stopPrank();

        vm.prank(comandante);
        cofre.ciclar(10, 0, pernasVazias);
    }

    /// Token que responde `false` no `approve` falharia adiante, culpando o
    /// inocente. O cofre checa o retorno e nomeia o token.
    function test_RevertWhen_AprovacaoRecusadaPeloToken() public {
        MotorFalso motor = new MotorFalso(moeda);
        _abastecer(100);
        vm.prank(dono);
        cofre.definirMotor(address(motor));

        moeda.setRecusaAprovacao(true);
        vm.expectRevert(
            abi.encodeWithSelector(
                TriviuVault.AprovacaoRecusada.selector, address(moeda), address(motor), 0
            )
        );
        vm.prank(dono);
        cofre.ciclar(10, 0, pernasVazias);
    }

    /* ====================================================================== */
    /*  5 · REENTRANCIA                                                        */
    /* ====================================================================== */

    function test_ReentradaNoCicloEBloqueadaPeloGuarda() public {
        MotorReentrante motor = new MotorReentrante(moeda);
        motor.apontar(cofre);
        _abastecer(100);
        vm.startPrank(dono);
        cofre.definirMotor(address(motor));
        cofre.definirComandante(address(motor));   // passa a autorizacao de propositO
        cofre.ciclar(50, 0, pernasVazias);
        vm.stopPrank();

        assertTrue(motor.tentou(), "o motor tem de ter TENTADO reentrar, senao o teste nao mede nada");
        assertEq(
            motor.motivoDaRecusa(),
            abi.encodeWithSelector(TriviuVault.Reentrante.selector),
            "a reentrada tem de ser barrada pelo GUARDA, nao por autorizacao"
        );
    }

    /* ====================================================================== */
    /*  6 · OS LIMITES DO CONSTRUTOR                                           */
    /* ====================================================================== */

    function test_RevertWhen_ConstruirComDonoZero() public {
        vm.expectRevert(TriviuVault.EnderecoZerado.selector);
        new TriviuVault(address(0), address(moeda));
    }

    function test_RevertWhen_ConstruirComBaseZero() public {
        vm.expectRevert(TriviuVault.EnderecoZerado.selector);
        new TriviuVault(dono, address(0));
    }

    function test_RevertWhen_DefinirMotorSemCodigo() public {
        vm.expectRevert(abi.encodeWithSelector(TriviuVault.MotorSemCodigo.selector, estranho));
        vm.prank(dono);
        cofre.definirMotor(estranho);
    }

    function test_RevertWhen_DefinirMotorPorEstranho() public {
        MotorFalso motor = new MotorFalso(moeda);
        vm.expectRevert(abi.encodeWithSelector(TriviuVault.NaoEDono.selector, estranho, dono));
        vm.prank(estranho);
        cofre.definirMotor(address(motor));
    }

    /* ====================================================================== */
    /*  FUZZ — a saida e do dono para QUALQUER endereco que nao seja ele        */
    /* ====================================================================== */

    function testFuzz_SoODonoSaca(address quem) public {
        vm.assume(quem != dono);
        vm.assume(quem != address(0));
        _abastecer(100);
        vm.expectRevert(abi.encodeWithSelector(TriviuVault.NaoEDono.selector, quem, dono));
        vm.prank(quem);
        cofre.sacar(1);
    }

    /// O saque nunca devolve mais do que o cofre tinha, para qualquer quantia.
    function testFuzz_SaqueNuncaExcedeOSaldo(uint96 saldo, uint96 pedido) public {
        vm.assume(saldo > 0);
        _abastecer(saldo);
        vm.prank(dono);
        if (pedido == 0) {
            vm.expectRevert(TriviuVault.QuantiaZero.selector);
            cofre.sacar(pedido);
        } else if (pedido > saldo) {
            vm.expectRevert(
                abi.encodeWithSelector(TriviuVault.SaldoInsuficiente.selector, pedido, saldo)
            );
            cofre.sacar(pedido);
        } else {
            cofre.sacar(pedido);
            assertEq(moeda.balanceOf(address(cofre)), uint256(saldo) - pedido);
        }
    }
}
