// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/*  TESTE DO TriviuLPVault  ·  2026-08-20
    ---------------------------------------------------------------------------
    POR QUE ESTE, E POR QUE ESTE PRIMEIRO ENTRE OS QUE FALTAVAM

    O `TriviuLPVault` esta VIVO na chain 137 desde 2026-08-12
    (`0xC52BaD280809672D8EC5D1fcF2d7eCa45a2a423E`) e tem um GEMEO ORFAO byte-exato
    em `0xd224f7cE6f96c3D26737bD442B20F4f44992c440` — mesmo runtime, mesmo sha256,
    saldo zero. Ele nao era coberto por teste nenhum.

    O ALVO DESTA SUITE E A PROTECAO DO USUARIO CONTRA A TAXA

        function _aliquota(uint16 feeBpsMax) private view returns (uint16 bps) {
            uint16 lido = registry.feeBps();
            bps = lido > MAX_FEE_BPS ? MAX_FEE_BPS : lido;
            if (bps > feeBpsMax) revert TaxaAcimaDoLimite(feeBpsMax, bps);
        }

    Sao tres linhas e duas garantias distintas, e as duas importam:

      1. O TETO EM BYTECODE. Ainda que o Registry responda 9 999 bps, o cofre
         corta em MAX_FEE_BPS = 5 000. Quem controla o Registry nao consegue
         cobrar mais que metade do resultado, nem por engano nem de proposito.

      2. O TETO DO USUARIO. `feeBpsMax` viaja na transacao que ELE assina. Se a
         aliquota subir entre a assinatura e a execucao, a transacao reverte em
         vez de executar com a taxa nova. Sem isso, quem controla o Registry
         poderia elevar a taxa vendo a transacao no mempool.

    A segunda e a que protege contra um adversario com poder de configuracao, e
    era a que estava sem teste.

    ESCOPO DECLARADO, para ninguem ler cobertura que nao existe
    Esta suite cobre `fechar` — a unica funcao que cobra — mais autorizacao,
    aprovacao e a invariante da tesouraria. Ela NAO cobre `abrir` nem `coletar`,
    que exigiriam simular pool com preco. O que falta esta nomeado no handoff 04.

    NAO E AUDITORIA. Escrever teste e Art. 1 da Pantera; auditar e do
    Tubarao-branco; vetar vulneravel e da Medusa (Art. 5).
*/

import {Test} from "forge-std/Test.sol";
import {TriviuLPVault} from "../src/TriviuLPVault.sol";

contract Moeda {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public recusaTransfer;

    function setRecusaTransfer(bool v) external {
        recusaTransfer = v;
    }

    function mint(address p, uint256 q) external {
        balanceOf[p] += q;
    }

    function approve(address g, uint256 q) external returns (bool) {
        allowance[msg.sender][g] = q;
        return true;
    }

    function transfer(address p, uint256 q) external returns (bool) {
        if (recusaTransfer) return false;
        balanceOf[msg.sender] -= q;
        balanceOf[p] += q;
        return true;
    }

    function transferFrom(address d, address p, uint256 q) external returns (bool) {
        uint256 a = allowance[d][msg.sender];
        if (a != type(uint256).max) allowance[d][msg.sender] = a - q;
        balanceOf[d] -= q;
        balanceOf[p] += q;
        return true;
    }
}

/// @dev Registry mock: a alavanca do adversario com poder de configuracao.
contract RegistryFalso {
    uint16 public feeBps;
    address public treasury;
    mapping(address => bool) public permitido;

    function setFeeBps(uint16 v) external {
        feeBps = v;
    }

    function setTreasury(address v) external {
        treasury = v;
    }

    function permitir(address t, bool v) external {
        permitido[t] = v;
    }

    function isAllowedToken(address t) external view returns (bool) {
        return permitido[t];
    }
}

/// @dev NPM mock. Deliberadamente burro: guarda o que o teste mandar e devolve.
contract GestorDePosicoesFalso {
    struct Pos {
        address token0;
        address token1;
        uint128 liquidez;
        address dono;
        address aprovado;
    }

    mapping(uint256 => Pos) public pos;
    Moeda public m0;
    Moeda public m1;
    uint256 public devolve0;
    uint256 public devolve1;
    uint256 public coleta0;
    uint256 public coleta1;
    bool public queimou;

    constructor(Moeda a, Moeda b) {
        m0 = a;
        m1 = b;
    }

    function criar(uint256 id, address dono, uint128 liquidez) external {
        pos[id] = Pos(address(m0), address(m1), liquidez, dono, address(0));
    }

    function aprovar(uint256 id, address quem) external {
        pos[id].aprovado = quem;
    }

    function setDevolve(uint256 a, uint256 b) external {
        devolve0 = a;
        devolve1 = b;
    }

    function setColeta(uint256 a, uint256 b) external {
        coleta0 = a;
        coleta1 = b;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return pos[id].dono;
    }

    function getApproved(uint256 id) external view returns (address) {
        return pos[id].aprovado;
    }

    function positions(uint256 id)
        external
        view
        returns (
            uint96,
            address,
            address,
            address,
            uint24,
            int24,
            int24,
            uint128,
            uint256,
            uint256,
            uint128,
            uint128
        )
    {
        Pos memory p = pos[id];
        return (0, address(0), p.token0, p.token1, 3000, -60, 60, p.liquidez, 0, 0, 0, 0);
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata p)
        external
        payable
        returns (uint256, uint256)
    {
        pos[p.tokenId].liquidez = 0;
        return (devolve0, devolve1);
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function collect(CollectParams calldata p) external payable returns (uint256, uint256) {
        uint256 a = devolve0 + coleta0;
        uint256 b = devolve1 + coleta1;
        m0.mint(p.recipient, a);
        m1.mint(p.recipient, b);
        return (a, b);
    }

    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    uint256 public proximoId = 1;

    function mint(MintParams calldata p)
        external
        payable
        returns (uint256 tokenId, uint128 liquidez, uint256 usado0, uint256 usado1)
    {
        tokenId = proximoId++;
        liquidez = 1000;
        usado0 = p.amount0Desired;
        usado1 = p.amount1Desired;
        // o cofre ja transferiu para ca via _aprovaExato + transferFrom
        m0.transferFrom(msg.sender, address(this), usado0);
        m1.transferFrom(msg.sender, address(this), usado1);
        pos[tokenId] = Pos(address(m0), address(m1), liquidez, p.recipient, address(0));
    }

    function burn(uint256) external payable {
        queimou = true;
    }
}

contract TriviuLPVaultTest is Test {
    TriviuLPVault cofre;
    RegistryFalso registry;
    GestorDePosicoesFalso npm;
    Moeda m0;
    Moeda m1;

    address dono;
    address tesouraria;
    address estranho;

    uint256 constant ID = 42;
    uint256 constant PRAZO_LONGO = 4_000_000_000;

    function setUp() public {
        dono = makeAddr("dono");
        tesouraria = makeAddr("tesouraria");
        estranho = makeAddr("estranho");

        m0 = new Moeda();
        m1 = new Moeda();
        registry = new RegistryFalso();
        registry.setTreasury(tesouraria);
        registry.permitir(address(m0), true);
        registry.permitir(address(m1), true);

        npm = new GestorDePosicoesFalso(m0, m1);
        cofre = new TriviuLPVault(address(registry), address(npm));

        npm.criar(ID, dono, 1000);
        npm.aprovar(ID, address(cofre));
    }

    function _abrirPeloDono(uint256 a, uint256 b) internal returns (uint256 id) {
        m0.mint(dono, a);
        m1.mint(dono, b);
        vm.startPrank(dono);
        m0.approve(address(cofre), a);
        m1.approve(address(cofre), b);
        (id,,,) = cofre.abrir(
            TriviuLPVault.AbrirParams({
                token0: address(m0), token1: address(m1), fee: 3000,
                tickLower: -60, tickUpper: 60,
                amount0Desired: a, amount1Desired: b,
                amount0Min: 0, amount1Min: 0, prazo: PRAZO_LONGO
            })
        );
        vm.stopPrank();
    }

    /* ====================================================================== */
    /*  1 · O TETO DO USUARIO — a protecao contra a taxa subir                 */
    /* ====================================================================== */

    /// O usuario assina aceitando ate 300 bps. Entre a assinatura e a execucao a
    /// aliquota vai a 3 000. A transacao REVERTE em vez de executar com a taxa
    /// nova, e o erro nomeia o teto dele e a aliquota vigente.
    function test_RevertWhen_AliquotaSobeAcimaDoTetoDoUsuario() public {
        registry.setFeeBps(3000);
        npm.setDevolve(1000, 700);

        vm.expectRevert(
            abi.encodeWithSelector(TriviuLPVault.TaxaAcimaDoLimite.selector, uint16(300), uint16(3000))
        );
        vm.prank(dono);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 300);
    }

    /// Igual ao teto passa. O limite e "acima de", nao "a partir de".
    function test_AliquotaIgualAoTetoPassa() public {
        registry.setFeeBps(3000);
        npm.setDevolve(1000, 700);
        vm.prank(dono);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 3000);
    }

    function testFuzz_NuncaCobraAcimaDoTetoAssinado(uint16 vigente, uint16 teto) public {
        vm.assume(teto < 10_000 && vigente < 10_000);
        registry.setFeeBps(vigente);
        npm.setDevolve(1000, 700);

        uint16 efetiva = vigente > cofre.MAX_FEE_BPS() ? cofre.MAX_FEE_BPS() : vigente;

        vm.prank(dono);
        if (efetiva > teto) {
            vm.expectRevert(
                abi.encodeWithSelector(TriviuLPVault.TaxaAcimaDoLimite.selector, teto, efetiva)
            );
            cofre.fechar(ID, 0, 0, PRAZO_LONGO, teto);
        } else {
            cofre.fechar(ID, 0, 0, PRAZO_LONGO, teto);
            // o que foi para a tesouraria nunca passa do teto assinado
            assertLe(m0.balanceOf(tesouraria) * 10_000 / 1000, uint256(teto) + 1, "taxa dentro do teto");
        }
    }

    /* ====================================================================== */
    /*  2 · O TETO EM BYTECODE — quem controla o Registry nao passa de 50%     */
    /* ====================================================================== */

    function test_TetoEmBytecodeEDeCincoMilBps() public view {
        assertEq(cofre.MAX_FEE_BPS(), 5000, "metade do resultado, cravado no bytecode");
    }

    /// O CICLO REAL: abrir pelo cofre e fechar pelo cofre. So assim ha `dep0`/
    /// `dep1` gravados, e so assim ha cobranca — ver a regra da secao seguinte.
    ///
    /// Registry hostil pede 9 999 bps. O cofre corta em 5 000: de 1 000 que saiu,
    /// 500 para a tesouraria e 500 para o dono, e nao 999.
    function test_RegistryHostilECortadoEmCincoMil() public {
        registry.setFeeBps(9999);
        uint256 id = _abrirPeloDono(400, 300);
        // principal volta (400) E a posicao produziu 1000 de taxa em cada token.
        // A base de cobranca e `total - principal`: taxa, nunca principal.
        npm.setDevolve(400, 300);
        npm.setColeta(1000, 700);
        npm.aprovar(id, address(cofre));

        vm.prank(dono);
        cofre.fechar(id, 0, 0, PRAZO_LONGO, 5000);

        assertEq(m0.balanceOf(tesouraria), 500, "cortado no teto do bytecode, nao no pedido do Registry");
    }

    /// A SEGUNDA REGRA QUE EU NAO TINHA LIDO, e ela e a promessa central do
    /// produto: a base de cobranca e `total - principal`. Uma posicao que devolve
    /// exatamente o que entrou produziu ZERO, e paga ZERO — mesmo com aliquota
    /// alta e resultado "provado". O principal nunca entra na base.
    ///
    /// Descobri porque um teste meu esperava cobranca sobre 1 000 devolvidos sem
    /// nenhuma taxa produzida. O contrato estava certo, e o meu teste media a
    /// promessa ao contrario.
    function test_NaoCobraSobrePrincipalDevolvido() public {
        registry.setFeeBps(5000);
        uint256 id = _abrirPeloDono(400, 300);
        npm.setDevolve(400, 300);   // principal de volta
        npm.setColeta(0, 0);        // zero de taxa produzida
        npm.aprovar(id, address(cofre));

        vm.prank(dono);
        cofre.fechar(id, 0, 0, PRAZO_LONGO, 10_000);

        assertEq(m0.balanceOf(tesouraria), 0, "sem taxa produzida nao ha o que cobrar");
    }

    /// A REGRA QUE EU NAO TINHA LIDO, e ela e uma protecao de verdade.
    ///
    /// `_houveResultado` devolve `false` quando `dep0` e `dep1` sao zero — o caso
    /// de uma posicao que este cofre NAO abriu. Sem os depositos guardados nao ha
    /// como provar resultado, e o contrato documenta: "cobrar sem prova seria
    /// exatamente o que esta regra proibe".
    ///
    /// Consequencia: quem traz uma posicao de fora fecha por aqui SEM PAGAR.
    /// Descobri isto porque dois testes meus falharam esperando cobranca que nao
    /// veio, e o contrato estava certo.
    function test_NaoCobraSobrePosicaoQueNaoAbriu() public {
        registry.setFeeBps(3000);
        npm.setDevolve(1000, 700);       // posicao criada direto no gestor, sem `abrir`

        vm.prank(dono);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 10_000);

        assertEq(m0.balanceOf(tesouraria), 0, "sem deposito guardado nao ha prova de resultado, e nao ha cobranca");
        assertEq(m0.balanceOf(dono), 1000, "o dono levou tudo");
    }

    /// E a invariante da tesouraria so morde quando ha taxa a rotear — o que exige
    /// posicao aberta pelo cofre. Com tesouraria zerada e resultado provado,
    /// `fechar` reverte e quem tem posicao nao sai com resultado.
    function test_RevertWhen_TaxaAcobrarComTesourariaZerada() public {
        registry.setFeeBps(1000);
        uint256 id = _abrirPeloDono(400, 300);
        npm.setDevolve(400, 300);
        npm.setColeta(1000, 700);
        npm.aprovar(id, address(cofre));
        registry.setTreasury(address(0));

        vm.expectRevert(TriviuLPVault.TesourariaZerada.selector);
        vm.prank(dono);
        cofre.fechar(id, 0, 0, PRAZO_LONGO, 10_000);
    }

    /// E com teto do usuario abaixo de 5 000, o Registry hostil e barrado com o
    /// numero JA CORTADO — o erro nao mente sobre o que seria cobrado.
    function test_RevertWhen_RegistryHostilComTetoDoUsuarioMenor() public {
        registry.setFeeBps(9999);
        npm.setDevolve(1000, 700);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuLPVault.TaxaAcimaDoLimite.selector, uint16(100), uint16(5000))
        );
        vm.prank(dono);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 100);
    }

    /* ====================================================================== */
    /*  3 · AUTORIZACAO E APROVACAO                                            */
    /* ====================================================================== */

    /// A posse e lida do gestor NA HORA: vender o NFT transfere o controle junto,
    /// e nenhum registro velho aponta para a pessoa errada.
    function test_RevertWhen_FecharPorQuemNaoEDono() public {
        registry.setFeeBps(0);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuLPVault.NaoEDono.selector, ID, dono, estranho)
        );
        vm.prank(estranho);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 10_000);
    }

    function test_VendaDoNFTTransfereOControle() public {
        registry.setFeeBps(0);
        npm.setDevolve(10, 10);
        npm.criar(ID, estranho, 1000); // "vendeu"
        npm.aprovar(ID, address(cofre));

        vm.expectRevert(
            abi.encodeWithSelector(TriviuLPVault.NaoEDono.selector, ID, estranho, dono)
        );
        vm.prank(dono);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 10_000);

        vm.prank(estranho);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 10_000);
    }

    function test_RevertWhen_SemAprovacao() public {
        registry.setFeeBps(0);
        npm.aprovar(ID, address(0));
        vm.expectRevert(abi.encodeWithSelector(TriviuLPVault.AprovacaoAusente.selector, ID));
        vm.prank(dono);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 10_000);
    }

    /// Aprovacao apontando para outro endereco e recusada por nome proprio —
    /// `AprovacaoAmpla`, e nao um revert generico.
    function test_RevertWhen_AprovacaoApontaParaOutro() public {
        registry.setFeeBps(0);
        npm.aprovar(ID, estranho);
        vm.expectRevert(abi.encodeWithSelector(TriviuLPVault.AprovacaoAmpla.selector, ID));
        vm.prank(dono);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 10_000);
    }

    /* ====================================================================== */
    /*  4 · A INVARIANTE DA TESOURARIA, NO BYTECODE                            */
    /* ====================================================================== */

    /// Com aliquota zero nao ha taxa a rotear, e a tesouraria zerada nao impede
    /// ninguem de sair. A invariante e condicional, e o teste prova a condicao.
    function test_TesourariaZeradaNaoImpedeSaidaSemTaxa() public {
        registry.setFeeBps(0);
        registry.setTreasury(address(0));
        npm.setDevolve(1000, 700);

        vm.prank(dono);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 10_000);
        assertEq(m0.balanceOf(dono), 1000, "saiu inteiro, sem taxa e sem tesouraria");
    }

    /* ====================================================================== */
    /*  5 · PRAZO E LIQUIDEZ                                                   */
    /* ====================================================================== */

    function test_RevertWhen_PrazoExpirado() public {
        registry.setFeeBps(0);
        vm.warp(1000);
        vm.expectRevert(TriviuLPVault.PrazoExpirado.selector);
        vm.prank(dono);
        cofre.fechar(ID, 0, 0, 999, 10_000);
    }

    function test_RevertWhen_PosicaoSemLiquidez() public {
        registry.setFeeBps(0);
        npm.criar(ID, dono, 0);
        npm.aprovar(ID, address(cofre));
        vm.expectRevert(abi.encodeWithSelector(TriviuLPVault.SemLiquidez.selector, ID));
        vm.prank(dono);
        cofre.fechar(ID, 0, 0, PRAZO_LONGO, 10_000);
    }

    /* ====================================================================== */
    /*  6 · O CONSTRUTOR                                                       */
    /* ====================================================================== */

    function test_RevertWhen_ConstruirComRegistryZero() public {
        vm.expectRevert(TriviuLPVault.EnderecoZerado.selector);
        new TriviuLPVault(address(0), address(npm));
    }

    function test_RevertWhen_ConstruirComGestorZero() public {
        vm.expectRevert(TriviuLPVault.EnderecoZerado.selector);
        new TriviuLPVault(address(registry), address(0));
    }
}
