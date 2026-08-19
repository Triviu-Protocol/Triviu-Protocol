// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {ITriviuExecutor} from "./TriviuVault.sol";

/*//////////////////////////////////////////////////////////////////////////
      TRIVIU CERCA v0.1
      Contrato de POLITICA do usuario — PRE-MAINNET, NAO AUDITADO EXTERNAMENTE.
      Fork local apenas, ate a Medusa liberar e o Gate 3 externo existir.
//////////////////////////////////////////////////////////////////////////*/

/// @title  TriviuCerca
/// @notice A cerca do usuario. Fica ENTRE o keeper e o cofre: e ela que o cofre
///         conhece como `comandante`, e e ela que recusa o que o dono nao
///         autorizou.
///
/// @dev    O QUE ESTE CONTRATO NAO FAZ — ditas primeiro, porque as ausencias
///         sao as decisoes que sustentam o resto:
///
///         - Ele NAO toca valor. Zero `transfer`, zero `transferFrom`, zero
///           `approve`, zero `receive`, zero `fallback`. Nenhum token entra
///           aqui, nenhum sai. Cerca que toca valor deixa de ser politica e
///           vira custodia.
///         - Ele NAO e dono de nada. O `dono` do cofre e imutavel la, e e o
///           usuario. Esta cerca so detem o direito de CHAMAR `ciclar`.
///         - Ele NAO tem funcao que o Triviu chame. Nenhum `onlyTriviu`, nem
///           para migracao, nem para emergencia. A custodia e do usuario, e
///           porta de servico contradiz isso.
///         - Ele NAO e atualizavel. Sem proxy, sem `implementation`, sem
///           `delegatecall`, sem `selfdestruct`. Politica mutavel e politica
///           inexistente: quem troca a logica troca a politica. Migrar e
///           implantar cerca nova e apontar `definirComandante` no cofre — ato
///           do dono, visivel e revogavel.
///         - Ele NAO le preco. Nenhum oraculo, nenhum `slot0`, nenhuma cotacao.
///           Preco aqui dentro reabriria toda a superficie de manipulacao que a
///           porta atomica fechou.
///         - Ele NAO gerencia perda. Sob a porta atomica do cofre nao ha perda
///           para gerenciar: `ciclar` devolve pelo menos o que levou ou reverte.
///           Cerca que promete limitar perda onde perda e impossivel e teatro.
///
/// @dev    A PROPRIEDADE QUE A ARQUITETURA COMPRA:
///
///         Esta cerca NAO CONSEGUE PERDER DINHEIRO nem inteiramente quebrada.
///         Todo caminho que ela pode tomar termina em `cofre.ciclar`, que
///         reverte se o cofre encolher. Cerca com defeito maximo = ciclos que
///         revertem = keeper queimando o proprio gas.
///
/// @dev    O QUE ELA GUARDA, E QUE A PORTA ATOMICA NAO GUARDAVA:
///
///         A porta atomica garante que o cofre NAO ENCOLHE. Ela nao garante que
///         o cofre CRESCE o que a oportunidade valia. Um comandante comprometido
///         monta o ciclo com `minProfit = 0` e `amountOutMin = 0`, roteia por um
///         router coludido, e fecha em break-even exato: `CofreEncolheu` nao
///         dispara porque o cofre nao encolheu, e `UnprofitableCycle` do motor
///         nao dispara porque 0 >= 0. O spread inteiro sai para o adversario.
///
///         `pisoDeLucroBps` fecha esse vetor, e e a unica razao pela qual esta
///         cerca existe como controle de seguranca e nao como conveniencia.
///
/// @dev    NASCE FECHADA — o que isso significa, campo a campo:
///
///         A regra nao e "tudo em zero nega". A regra e por DIRECAO:
///
///         - TETOS negam em zero. `tamanhoMaximo` e `precoMaximoDeGas` em zero
///           NEGAM, porque zero-como-ilimitado e a falha-aberto classica.
///         - PISOS QUE GUARDAM VALOR negam em zero. `pisoDeLucroBps` em zero e
///           exatamente a vulnerabilidade descrita acima.
///         - CONJUNTOS negam vazios. `ativosPermitidos` e `routersPermitidos`
///           vazios NEGAM. Sem `if (vazio) return true` — allowlist sem teste
///           que force a negacao e decoracao.
///         - O piso puramente ECONOMICO e permissivo em zero.
///           `tamanhoMinimo` em zero significa "sem piso economico", e nao
///           guarda valor de ninguem: quem paga o gas de um ciclo pequeno demais
///           e o keeper.
///         - A CADENCIA e permissiva em zero. `intervaloMinimo` em zero
///           significa "sem espera", e o custo de cadencia alta tambem e do
///           keeper.
///
/// @dev    O DONO NUNCA FICA PRESO. Nenhum estado desta cerca alcanca o cofre:
///         `sacar` e `resgatar` la sao `soDono`, sem teto e sem espera, e o dono
///         chama `cofre.ciclar` direto sem passar por aqui. Alem disso,
///         `definirComandante(address(0))` no cofre corta esta cerca inteira do
///         circuito — o freio real do dono vive no cofre auditado, nao aqui.
///
/// @dev    `definirPausa` e CONVENIENCIA, nao defesa. O freio de seguranca e o
///         `definirComandante(0)` do cofre. Vender pausa como controle de
///         seguranca quando o controle de seguranca e outro foi o que gerou o
///         veto de 2026-08-06.
///
/// @dev    `precoMaximoDeGas` e CUSTO, NUNCA DEFESA. Um comandante hostil
///         escolhe o proprio `gasprice` e passa por baixo do teto trivialmente.
///         Este teto protege o dono honesto de queimar gas em pico de rede.
///         Contra adversario vale zero, e esta escrito aqui para que nenhuma
///         superficie o descreva como protecao.
interface ITriviuVaultParaCerca {
    function base() external view returns (address);
    function dono() external view returns (address);
    function ciclar(uint256 principal, uint256 minProfit, ITriviuExecutor.Leg[] calldata legs)
        external
        returns (uint256);
}

contract TriviuCerca {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTES
    //////////////////////////////////////////////////////////////*/

    /// @notice Teto de pernas por ciclo. Laco sem limite superior e vetor de
    ///         DoS por gas (veto metodologico da Pantera, Art. 4).
    uint256 public constant MAX_PERNAS = 8;

    /// @notice Base de pontos. 10000 bps = 100%.
    uint256 public constant BPS = 10_000;

    /// @notice Segundos num dia. A janela e expressa em segundos do dia em UTC.
    uint32 public constant SEGUNDOS_NO_DIA = 86_400;

    /*//////////////////////////////////////////////////////////////
                                 IMUTAVEIS
    //////////////////////////////////////////////////////////////*/

    /// @notice Dono desta cerca. Imutavel: nao ha caminho que transfira a posse.
    address public immutable dono;

    /// @notice Cofre que esta cerca comanda.
    ITriviuVaultParaCerca public immutable cofre;

    /// @notice Moeda base do cofre, lida dele na construcao. O ciclo abre e
    ///         fecha nela, e a cerca verifica isso perna a perna.
    address public immutable base;

    /*//////////////////////////////////////////////////////////////
                          ESTADO · SLOT 0 (empacotado)
    //////////////////////////////////////////////////////////////*/

    /// @notice Unico endereco que atravessa esta cerca. Zero fecha para todos.
    address public operador; // 160 bits

    /// @notice Freio de conveniencia do dono. NASCE LIGADO.
    bool public pausada; // 8 bits

    /// @notice Piso de lucro exigido, em bps do principal. ZERO NEGA.
    ///         Este e o controle que fecha o roubo do spread.
    ///
    /// @dev    LIQUIDO, NAO BRUTO — cravado antes de a taxa existir, para nao
    ///         virar ambiguidade depois. A checagem de entrega compara contra
    ///         `crescimento`, que e a diferenca de saldo DO COFRE DO DONO. Quando
    ///         a taxa do protocolo passar a ser deduzida no motor, o que chega ao
    ///         cofre ja e o liquido, e este piso mede o liquido.
    ///
    ///         E o numero certo para o dono medir: ele nao recebe o bruto, e um
    ///         piso sobre bruto deixaria passar ciclo que entrega abaixo do que
    ///         ele exigiu depois de descontada a nossa parte.
    uint16 public pisoDeLucroBps; // 16 bits

    /// @notice Bitmask dos dias da semana permitidos. Bit 0 = domingo, ate o
    ///         bit 6 = sabado, em UTC. ZERO NEGA.
    uint8 public diasPermitidos; // 8 bits

    /// @notice Inicio e fim da janela, em segundos do dia UTC. `fim <= inicio`
    ///         significa janela que atravessa a meia-noite, que e o buffer de
    ///         fecho. Ambos em zero NEGAM.
    uint32 public janelaInicioSeg; // 32 bits
    uint32 public janelaFimSeg; // 32 bits

    /*//////////////////////////////////////////////////////////////
                            ESTADO · DEMAIS SLOTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Teto de principal por ciclo. ZERO NEGA.
    uint256 public tamanhoMaximo;

    /// @notice Piso economico de principal por ciclo. Zero = sem piso.
    uint256 public tamanhoMinimo;

    /// @notice Teto de `tx.gasprice`. ZERO NEGA. E custo, nao defesa.
    uint256 public precoMaximoDeGas;

    /// @notice Espera minima entre ciclos, em segundos. Zero = sem espera.
    uint32 public intervaloMinimo;

    /// @notice Instante do ultimo ciclo que atravessou esta cerca.
    uint64 public ultimoCiclo;

    uint8 private constant _NAO_ENTROU = 1;
    uint8 private constant _ENTROU = 2;
    uint8 private _estado;

    /// @notice Tokens que as pernas podem tocar. VAZIO NEGA.
    mapping(address => bool) public ativoPermitido;

    /// @notice Contratos para os quais o motor pode rotear. VAZIO NEGA.
    mapping(address => bool) public routerPermitido;

    /*//////////////////////////////////////////////////////////////
                                   ERROS
    //////////////////////////////////////////////////////////////*/

    error NaoEDono(address quemChamou, address dono);
    error NaoEOperador(address quemChamou, address operador);
    error CercaPausada();
    error EnderecoZerado();
    // `CofreDeOutroDono(address donoDoCofre, address donoDaCerca)` vivia aqui e
    // SAIU em 2026-08-12. Ele disparava quando `c.dono() != msg.sender` no
    // construtor — a trava que impedia a `TriviuFactory` de criar a cerca. Com o
    // dono derivado do cofre, a condicao virou inalcancavel, e erro que nao
    // dispara e superficie de ABI que mente sobre o que o contrato faz.
    error SemPernas();
    error PernasDemais(uint256 pernas, uint256 maximo);
    /// @dev Emitido quando o teto nunca foi configurado. ZERO NEGA, e o erro
    ///      diz isso em vez de deixar o dono achar que zero era ilimitado.
    error TetoNaoConfigurado();
    /// @dev Distinto de `TetoNaoConfigurado` de proposito. Dois gates com o
    ///      mesmo erro obrigam quem le o revert a adivinhar qual disparou, e
    ///      diagnostico que exige adivinhacao e diagnostico que mente.
    error TetoDeGasNaoConfigurado();
    error PisoDeLucroNaoConfigurado();
    error JanelaNaoConfigurada();
    /// @dev Distinto de `JanelaNaoConfigurada` pelo mesmo motivo que
    ///      `TetoDeGasNaoConfigurado` e distinto de `TetoNaoConfigurado`:
    ///      faltar dia da semana e faltar janela sao duas causas, e um erro so
    ///      obrigaria quem le o revert a adivinhar qual delas foi. (MC-2)
    error DiasNaoConfigurados();
    /// @dev Piso acima do teto e configuracao morta: todo ciclo reverteria, e o
    ///      dono descobriria na primeira operacao em vez de na hora de
    ///      configurar. Mesmo motivo do `MotorSemCodigo` do cofre. (MC-3)
    error TamanhoInvalido(uint256 minimo, uint256 maximo);
    /// @dev O ciclo foi autorizado, executou, e ENTREGOU menos que o piso. Nao
    ///      confundir com `LucroAbaixoDoPiso`, que recusa o PEDIDO antes de
    ///      qualquer chamada externa. (MC-1)
    error LucroEntregueAbaixoDoPiso(uint256 entregue, uint256 exigido);
    error PrincipalAcimaDoTeto(uint256 pedido, uint256 teto);
    error PrincipalAbaixoDoPiso(uint256 pedido, uint256 piso);
    error LucroAbaixoDoPiso(uint256 pedido, uint256 exigido);
    error GasAcimaDoTeto(uint256 gasprice, uint256 teto);
    error CedoDemais(uint64 agora, uint64 liberadoEm);
    error ForaDaJanela(uint32 segundoDoDia, uint32 inicio, uint32 fim);
    error DiaNaoPermitido(uint8 diaDaSemana, uint8 mascara);
    error AtivoNaoPermitido(address token, uint256 perna);
    error RouterNaoPermitido(address router, uint256 perna);
    /// @dev A perna nao encadeia com a anterior, ou o ciclo nao abre e fecha na
    ///      moeda base. Cadeia quebrada e como um conjunto de pernas hostil se
    ///      parece com um ciclo legitimo.
    error CicloNaoFecha(address esperado, address recebido, uint256 perna);
    error BpsAcimaDoMaximo(uint16 informado);
    error JanelaInvalida(uint32 inicio, uint32 fim);
    error Reentrante();

    /*//////////////////////////////////////////////////////////////
                                  EVENTOS
    //////////////////////////////////////////////////////////////*/

    event OperadorDefinido(address indexed anterior, address indexed novo);
    event PausaDefinida(bool anterior, bool nova);
    event AtivoDefinido(address indexed token, bool permitido);
    event RouterDefinido(address indexed router, bool permitido);
    event TamanhoDefinido(uint256 minimo, uint256 maximo);
    event PisoDeLucroDefinido(uint16 anterior, uint16 novo);
    event PrecoMaximoDeGasDefinido(uint256 anterior, uint256 novo);
    event IntervaloDefinido(uint32 anterior, uint32 novo);
    event JanelaDefinida(uint32 inicio, uint32 fim, uint8 dias);
    event CicloAutorizado(
        address indexed operador,
        uint256 principal,
        uint256 minProfit,
        uint256 crescimento
    );

    /*//////////////////////////////////////////////////////////////
                               MODIFICADORES
    //////////////////////////////////////////////////////////////*/

    modifier soDono() {
        if (msg.sender != dono) revert NaoEDono(msg.sender, dono);
        _;
    }

    /// @dev O cofre ja tem guarda proprio, e ele pegaria a reentrada. Este aqui
    ///      existe para que a seguranca desta cerca nao dependa de raciocinio
    ///      sobre outro contrato — CEI mais guarda, como manda o Art. 4.
    modifier naoReentrante() {
        if (_estado == _ENTROU) revert Reentrante();
        _estado = _ENTROU;
        _;
        _estado = _NAO_ENTROU;
    }

    /// @param cofre_ Cofre que esta cerca vai comandar.
    /// @dev   Tudo nasce fechado: pausada, sem operador, sem ativo, sem router,
    ///        teto zerado, piso de lucro zerado, janela zerada. O dono arma.
    ///
    /// @dev   O DONO E DERIVADO DO COFRE, e nao conferido contra o chamador.
    ///
    ///        Ate 2026-08-12 este construtor exigia `c.dono() == msg.sender`, e
    ///        essa exigencia tornava a `TriviuFactory` incapaz de criar a cerca:
    ///        la o `msg.sender` e a fabrica, e o `dono()` do cofre e o usuario,
    ///        entao a criacao revertia `CofreDeOutroDono`. O erro SAIU do
    ///        contrato por ter ficado inalcancavel; o registro dele fica aqui.
    ///
    ///        A propriedade de seguranca real sempre foi "a cerca tem o mesmo
    ///        dono que o cofre" — e nao "quem chamou e o dono". Derivando de
    ///        `c.dono()`, essa propriedade passa a valer POR CONSTRUCAO: nao
    ///        sobra nada a conferir, porque uma comparacao compararia um valor
    ///        com ele mesmo.
    ///
    ///        O QUE ISSO AFROUXA, medido e declarado: qualquer endereco passa a
    ///        conseguir implantar uma cerca apontada para um cofre alheio. O que
    ///        ele NAO ganha e o que importa — a cerca nasce com o `dono` do
    ///        cofre, entao o proprio criador dela reverte `NaoEDono` nos NOVE
    ///        setters (`test_I7_cercaIntrusa_nasceDoDonoDoCofreEnaoDeQuemCriou`
    ///        e `test_A14b_quemCriaCercaAlheia_naoMoveNenhumCampo`), ela nasce
    ///        pausada, sem operador e com piso zero
    ///        (`test_A14_cercaParaCofreAlheio_nasceComOdonoDoCofre`), e so um
    ///        ato do dono do cofre a poe no circuito
    ///        (`test_I7b_aIntrusaNaoEComandanteEnaoMoveSaldo`). Uma cerca
    ///        intrusa e INCONFIGURAVEL por quem a criou.
    ///
    ///        O QUE SOBRA, e nao e perda de poder e sim de PROCEDENCIA: uma
    ///        cerca entregue por terceiro e indistinguivel de uma legitima,
    ///        porque tem estado identico. Consequencia para quem constroi tela:
    ///        NUNCA aceite endereco de cerca digitado — use so o que veio de
    ///        `TriviuRegistry.cercaDe[dono][base]`.
    ///
    ///        Endereco sem codigo cai aqui mesmo: `c.dono()` e chamada de alto
    ///        nivel com retorno, entao o compilador insere `extcodesize` e a
    ///        construcao reverte SEM UM BYTE de motivo — o revert do
    ///        `extcodesize` nao carrega dado nenhum, e quem espera erro nomeado
    ///        aqui espera o que nao vem. Falha fechada, verificada em
    ///        `test_A15_cofreSemCodigoRecusado` e em
    ///        `testFuzz_I8_cercaParaEnderecoSemCodigo_reverte`.
    constructor(address cofre_) {
        if (cofre_ == address(0)) revert EnderecoZerado();
        ITriviuVaultParaCerca c = ITriviuVaultParaCerca(cofre_);
        address donoDoCofre = c.dono();
        if (donoDoCofre == address(0)) revert EnderecoZerado();
        dono = donoDoCofre;
        cofre = c;
        base = c.base();
        pausada = true;
        _estado = _NAO_ENTROU;
    }

    /*//////////////////////////////////////////////////////////////
                                GOVERNANCA
    //////////////////////////////////////////////////////////////*/

    /// @notice Define quem atravessa esta cerca. Zero fecha para todos.
    function definirOperador(address novo) external soDono {
        emit OperadorDefinido(operador, novo);
        operador = novo;
    }

    /// @notice Liga e desliga o freio de conveniencia.
    /// @dev    Nao e o freio de seguranca. Ver a nota do cabecalho.
    function definirPausa(bool valor) external soDono {
        emit PausaDefinida(pausada, valor);
        pausada = valor;
    }

    /// @notice Permite ou proibe um token nas pernas do ciclo.
    function definirAtivo(address token, bool permitido) external soDono {
        if (token == address(0)) revert EnderecoZerado();
        ativoPermitido[token] = permitido;
        emit AtivoDefinido(token, permitido);
    }

    /// @notice Permite ou proibe um contrato de roteamento.
    /// @dev    `Leg.router` e endereco arbitrario do chamador, e e por ele que o
    ///         valor sai. Permitir token sem permitir router deixa o campo mais
    ///         perigoso da perna sem dono.
    function definirRouter(address router, bool permitido) external soDono {
        if (router == address(0)) revert EnderecoZerado();
        routerPermitido[router] = permitido;
        emit RouterDefinido(router, permitido);
    }

    /// @notice Define piso economico e teto de principal por ciclo.
    /// @param  minimo Zero significa sem piso economico.
    /// @param  maximo Zero NEGA todo ciclo. Nao existe "ilimitado" aqui.
    function definirTamanho(uint256 minimo, uint256 maximo) external soDono {
        // `maximo == 0` continua valendo: e o teto NAO configurado, que nega.
        // O que se recusa aqui e piso acima de teto nao-zero, que e engano.
        if (maximo != 0 && minimo > maximo) revert TamanhoInvalido(minimo, maximo);
        tamanhoMinimo = minimo;
        tamanhoMaximo = maximo;
        emit TamanhoDefinido(minimo, maximo);
    }

    /// @notice Define o lucro minimo exigido, em bps do principal.
    /// @dev    Em bps e nao em unidades absolutas de proposito: piso absoluto
    ///         vira irrelevante quando o principal cresce e proibitivo quando
    ///         encolhe.
    function definirPisoDeLucro(uint16 bps) external soDono {
        if (bps > BPS) revert BpsAcimaDoMaximo(bps);
        emit PisoDeLucroDefinido(pisoDeLucroBps, bps);
        pisoDeLucroBps = bps;
    }

    /// @notice Define o teto de `tx.gasprice`. Zero NEGA.
    function definirPrecoMaximoDeGas(uint256 teto) external soDono {
        emit PrecoMaximoDeGasDefinido(precoMaximoDeGas, teto);
        precoMaximoDeGas = teto;
    }

    /// @notice Define a espera minima entre ciclos, em segundos.
    function definirIntervalo(uint32 segundos) external soDono {
        emit IntervaloDefinido(intervaloMinimo, segundos);
        intervaloMinimo = segundos;
    }

    /// @notice Define a janela de operacao em segundos do dia UTC e a mascara de
    ///         dias da semana.
    /// @dev    Nao existe fuso horario no EVM. `block.timestamp` e UTC, e
    ///         horario local e deslocamento que o dono aplica antes de chamar
    ///         aqui. Regra de horario de verao nao cabe em contrato e nao entra.
    ///
    ///         `fim <= inicio` e janela que atravessa a meia-noite, e e assim
    ///         que o buffer de fecho se expressa. Dia inteiro e (0, 86400).
    /// @param  inicio Segundo do dia em que a janela abre.
    /// @param  fim    Segundo do dia em que a janela fecha.
    /// @param  dias   Bitmask: bit 0 = domingo ... bit 6 = sabado. ZERO NEGA.
    function definirJanela(uint32 inicio, uint32 fim, uint8 dias) external soDono {
        if (inicio > SEGUNDOS_NO_DIA || fim > SEGUNDOS_NO_DIA) {
            revert JanelaInvalida(inicio, fim);
        }
        if (inicio == fim && inicio != 0) revert JanelaInvalida(inicio, fim);
        janelaInicioSeg = inicio;
        janelaFimSeg = fim;
        diasPermitidos = dias;
        emit JanelaDefinida(inicio, fim, dias);
    }

    /*//////////////////////////////////////////////////////////////
                                 O PORTAO
    //////////////////////////////////////////////////////////////*/

    /// @notice Autoriza um ciclo e o repassa ao cofre.
    /// @dev    Ordem: checa tudo, escreve a cadencia, so entao chama para fora
    ///         (CEI). O guarda de reentrancia cobre a chamada externa mesmo com
    ///         `intervaloMinimo` em zero, cenario no qual a checagem de cadencia
    ///         sozinha nao barraria a volta.
    /// @param  principal Capital a arriscar, na moeda base do cofre.
    /// @param  minProfit Lucro minimo exigido do motor.
    /// @param  legs      Pernas do ciclo, encadeadas e fechando na moeda base.
    /// @return crescimento O que o cofre reportou de diferenca de saldo.
    function ciclar(uint256 principal, uint256 minProfit, ITriviuExecutor.Leg[] calldata legs)
        external
        naoReentrante
        returns (uint256 crescimento)
    {
        // --- quem ---
        if (pausada) revert CercaPausada();
        address op = operador;
        if (msg.sender != op) revert NaoEOperador(msg.sender, op);

        // --- quanto ---
        uint256 teto = tamanhoMaximo;
        if (teto == 0) revert TetoNaoConfigurado();
        if (principal > teto) revert PrincipalAcimaDoTeto(principal, teto);
        uint256 piso = tamanhoMinimo;
        if (principal < piso) revert PrincipalAbaixoDoPiso(principal, piso);

        // --- o lucro exigido · o controle que fecha o roubo do spread ---
        uint16 bps = pisoDeLucroBps;
        if (bps == 0) revert PisoDeLucroNaoConfigurado();
        uint256 lucroExigido = (principal * bps) / BPS;
        if (minProfit < lucroExigido) revert LucroAbaixoDoPiso(minProfit, lucroExigido);

        // --- custo, nunca defesa ---
        uint256 tetoDeGas = precoMaximoDeGas;
        if (tetoDeGas == 0) revert TetoDeGasNaoConfigurado();
        if (tx.gasprice > tetoDeGas) revert GasAcimaDoTeto(tx.gasprice, tetoDeGas);

        // --- quando ---
        // Uma leitura de relogio so, passada adiante. Ler `block.timestamp` em
        // tres lugares da tres chances de os tres discordarem no futuro.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 agora = uint64(block.timestamp);
        _exigeCadencia(agora);
        _exigeJanela(agora);

        // --- o que as pernas tocam ---
        _exigePernasLimpas(legs);

        // --- efeito antes da interacao ---
        ultimoCiclo = agora;

        crescimento = cofre.ciclar(principal, minProfit, legs);

        // MC-1 · a promessa desta cerca, verificada em vez de delegada.
        //
        // A checagem la em cima recusa o PEDIDO abaixo do piso. Ela sozinha
        // deixava a ENTREGA por conta do motor, que e quem faz `minProfit`
        // valer — e o motor e trocavel pelo dono. A Medusa provou com PoC: com
        // um motor que ignora `minProfit`, o ciclo passava com `crescimento`
        // zero e o piso armado.
        //
        // O cofre irmao ja tinha escrito a regra: "o cofre nao delega a sua
        // unica promessa a um contrato que o dono pode trocar."
        //
        // LIMITE CONHECIDO, dito aqui e nao escondido: `crescimento` e a
        // diferenca de saldo do cofre, e uma doacao durante a chamada entra
        // nela (a Medusa provou isso em c406dbbe). Quem doar o piso para passar
        // por aqui pagou o piso, e quem recebeu foi o dono — o ataque custa
        // exatamente o que concede.
        if (crescimento < lucroExigido) {
            revert LucroEntregueAbaixoDoPiso(crescimento, lucroExigido);
        }

        emit CicloAutorizado(op, principal, minProfit, crescimento);
    }

    /*//////////////////////////////////////////////////////////////
                                  INTERNO
    //////////////////////////////////////////////////////////////*/

    /// @dev Cadencia. `intervaloMinimo` em zero libera, e o custo de cadencia
    ///      alta e do keeper, nao do dono.
    function _exigeCadencia(uint64 agora) private view {
        uint32 intervalo = intervaloMinimo;
        if (intervalo == 0) return;
        uint64 liberadoEm = ultimoCiclo + intervalo;
        if (agora < liberadoEm) revert CedoDemais(agora, liberadoEm);
    }

    /// @dev Janela e dia da semana, em UTC. Nenhuma decisao de dinheiro depende
    ///      deste relogio — `block.timestamp` e manipulavel na casa de segundos
    ///      por quem ordena bloco, e na Arbitrum o sequenciador e centralizado.
    ///      Isto e preferencia operacional do dono, e esta escrito assim para
    ///      que ninguem passe a decidir valor pelo relogio depois.
    function _exigeJanela(uint64 agora) private view {
        uint8 dias = diasPermitidos;
        if (dias == 0) revert DiasNaoConfigurados();

        // Epoch 0 foi uma quinta-feira; +4 leva a origem para domingo.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint8 diaDaSemana = uint8(((agora / SEGUNDOS_NO_DIA) + 4) % 7);
        if ((dias >> diaDaSemana) & 1 == 0) revert DiaNaoPermitido(diaDaSemana, dias);

        uint32 inicio = janelaInicioSeg;
        uint32 fim = janelaFimSeg;
        if (inicio == 0 && fim == 0) revert JanelaNaoConfigurada();

        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 segundoDoDia = uint32(agora % SEGUNDOS_NO_DIA);
        bool dentro;
        if (inicio < fim) {
            dentro = segundoDoDia >= inicio && segundoDoDia < fim;
        } else {
            // Atravessa a meia-noite: [inicio, 86400) unido a [0, fim).
            dentro = segundoDoDia >= inicio || segundoDoDia < fim;
        }
        if (!dentro) revert ForaDaJanela(segundoDoDia, inicio, fim);
    }

    /// @dev Valida TODA perna, nao a primeira. Tres coisas por perna: o router
    ///      esta na lista, os dois tokens estao na lista, e a perna encadeia com
    ///      a anterior. O encadeamento e o que distingue um ciclo de um conjunto
    ///      de trocas soltas montado por quem quer o spread.
    function _exigePernasLimpas(ITriviuExecutor.Leg[] calldata legs) private view {
        uint256 n = legs.length;
        if (n == 0) revert SemPernas();
        if (n > MAX_PERNAS) revert PernasDemais(n, MAX_PERNAS);

        address esperado = base;
        for (uint256 i; i < n; ++i) {
            ITriviuExecutor.Leg calldata perna = legs[i];

            if (!routerPermitido[perna.router]) revert RouterNaoPermitido(perna.router, i);
            if (!ativoPermitido[perna.tokenIn]) revert AtivoNaoPermitido(perna.tokenIn, i);
            if (!ativoPermitido[perna.tokenOut]) revert AtivoNaoPermitido(perna.tokenOut, i);

            if (perna.tokenIn != esperado) revert CicloNaoFecha(esperado, perna.tokenIn, i);
            esperado = perna.tokenOut;
        }

        // O ciclo tem de voltar para a moeda base.
        if (esperado != base) revert CicloNaoFecha(base, esperado, n - 1);
    }
}
