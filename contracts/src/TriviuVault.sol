// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/*//////////////////////////////////////////////////////////////////////////
      TRIVIU VAULT v0.1
      Cofre do usuario — PRE-MAINNET, NAO AUDITADO EXTERNAMENTE.
      Fork local apenas, ate a Medusa liberar e o Gate 3 externo existir.
//////////////////////////////////////////////////////////////////////////*/

/// @title  TriviuVault
/// @notice O cofre que o usuario implanta e possui. Guarda o saldo ocioso dele
///         e e o `msg.sender` que aprova e dispara o motor compartilhado.
///
/// @dev    O QUE ESTE CONTRATO NAO FAZ — dito antes, porque as ausencias sao
///         decisoes:
///
///         - Ele NAO e nosso. `dono` e imutavel e recebe o endereco de quem
///           mandou implantar. Nao existe funcao que o troque, nem por ele.
///         - Ele NAO segura posicao entre transacoes. O motor abre e fecha na
///           mesma transacao ou reverte. Sem posicao segurada nao ha contador
///           de posicao, e sem contador nao ha contador para dessincronizar.
///         - Ele NAO deixa aprovacao pendurada. Aprova o exato, chama, zera. Um
///           `allowance` vivo num cofre que guarda saldo e um `allowance` vivo
///           sobre o saldo.
///         - Ele NAO conhece o keeper. O cofre conhece o `comandante`; quem
///           conhece o keeper e o comandante. Uma camada, uma responsabilidade.
///         - Ele NAO guarda contador espelhado de saldo. A verdade e
///           `base.balanceOf(address(this))`. Contador espelhado desincroniza, e
///           foi assim que a saida de emergencia do desenho anterior travava o
///           executor de quem a usava.
///
/// @dev    A PROMESSA CENTRAL, E ELA ESTA NO BYTECODE:
///
///         `ciclar` mede o saldo antes e depois, e REVERTE se o cofre encolheu.
///         O motor auditado ja reverte por conta propria quando o ciclo nao
///         fecha em lucro (`UnprofitableCycle`), mas o cofre nao delega a sua
///         unica promessa a um contrato que o dono pode trocar. Se um motor
///         futuro tiver defeito, o cofre recusa a perda em vez de aceita-la.
///
///         O QUE ESTA PROMESSA COBRE, E O QUE ELA NAO COBRE.
///
///         Este paragrafo estava ERRADO ate 2026-08-12. A frase errada fica
///         registrada, porque apagar o engano apaga o motivo do conserto. Ela
///         dizia:
///
///           "Consequencia direta: um comandante comprometido NAO consegue
///            perder o dinheiro do dono. Ele consegue, no maximo, gastar o
///            proprio gas em tentativas que revertem."
///
///         FALSO. Medido por PoC executado, nao estimado
///         (`test/MedusaTetoComandantePoC.t.sol`): com principal de 100.000e6 e
///         spread de 1.000e6, um comandante comprometido fechando em break-even
///         exato levou 1.000e6 — 100% do spread — com o cofre em 100.000e6,
///         INTACTO, e a tesouraria em ZERO. Repetido dez vezes: 10.000e6 para o
///         adversario, principal sempre intacto.
///
///         O ciclo nao reverte porque nada aqui e violado: `minProfit = 0`
///         satisfaz o motor, e `depois == antes` satisfaz `CofreEncolheu`. A
///         porta atomica guarda o PRINCIPAL. Ela nunca guardou o SPREAD.
///
///         O QUE ESTE CONTRATO GARANTE, na letra: o cofre nao encolhe. Um
///         comandante comprometido nao alcanca o principal do dono, e nao
///         alcanca a saida — `sacar` e `resgatar` sao `soDono` e nao dependem
///         dele. O teto do dano dele e o spread do ciclo que ele mesmo monta.
///
///         O QUE FECHA O SPREAD e a `TriviuCerca`, e ela NAO vive aqui: e um
///         contrato de politica separado, com `pisoDeLucroBps`, que recusa nas
///         duas pontas — o PEDIDO em `LucroAbaixoDoPiso`, antes de qualquer
///         chamada externa, e a ENTREGA em `LucroEntregueAbaixoDoPiso`, depois
///         de o ciclo voltar. Desde 2026-08-12 a `TriviuFactory` implanta a
///         cerca junto com o cofre e a aponta como `comandante` inicial, entao
///         o caminho padrao ja nasce com ela na frente.
///
///         E a cerca CORTA, nao ZERA. Com piso de 50 bps sobre spread de
///         1.000e6, o dono recebe 500e6 e o operador embolsa os outros 500e6
///         (medido em `test_PoC_MT3`). O residual e
///         `spread - principal * bps / 10000`, e esta escrito aqui porque quem
///         escolhe o piso precisa do numero, nao de "a cerca resolve".
///
///         A GARANTIA DO PARAGRAFO ANTERIOR E CONDICIONAL AO CAMINHO DA
///         FABRICA, e a condicao fica escrita porque garantia sem condicao e
///         exatamente o defeito M-1 que este cabecalho ja cometeu uma vez.
///         Este contrato, sozinho, NAO instala cerca nenhuma: quem cria a
///         cerca e a `TriviuFactory`. Um cofre construido DIRETO — `new
///         TriviuVault(dono, base)` fora da fabrica — nasce com `comandante`
///         em zero, sem cerca, e fica INTEIRAMENTE exposto ao teto acima no
///         instante em que alguem apontar um keeper. So o caminho da fabrica
///         entrega o par amarrado (`testFuzz_I1_oTrianguloFechaSempre`).
///
///         DUAS PORTAS REABREM O TETO, e as duas sao do dono:
///
///         1 · `definirComandante(keeper)` num cofre vindo da fabrica passa
///             por cima da cerca instalada. E o freio de mao dele — o mesmo
///             caminho com que troca de cerca ou corta a cerca do circuito — e
///             trava-lo seria prende-lo no nosso desenho.
///         2 · construir o cofre fora da fabrica, que nunca poe cerca alguma.
///
///         E POR ISSO QUE `test_PoC_MT1` CONTINUA VERDE, e verde e o resultado
///         certo. ATENCAO ao motivo, porque o motivo intuitivo esta ERRADO:
///         aquele teste NAO constroi o cofre direto. Ele o recebe da fabrica,
///         com a cerca ja apontada, e entao a DONA chama
///         `definirComandante(mallory)`. Ele mede a porta 1, nunca a porta 2.
///         Quem mede o que o fix de fato mudou e `test_PoC_MT4`: pelo caminho
///         da fabrica, sem nenhum ato adicional da dona, o keeper NAO alcanca
///         o spread.
///
///         O conserto mudou o PADRAO, nao a possibilidade.
///
/// @dev    A SAIDA E INCONDICIONAL. `sacar` e `resgatar` sao `onlyDono`, sem
///         teto, sem espera, sem aprovacao de terceiro, e funcionam com o motor
///         zerado, o comandante zerado, e o mundo inteiro offline.
///
/// @dev    LIMITACOES CONHECIDAS (honestidade > marketing · MD-C e MD-D da
///         auditoria da Medusa em c406dbbe):
///
///         - Token base com TAXA NA TRANSFERENCIA inutiliza este cofre. O
///           principal encolhe na ida ao motor e de novo na volta, entao
///           `depois < antes` e TODO ciclo reverte. Nao e degradacao: e o cofre
///           travado para aquele token. Ele nao deve entrar na whitelist do
///           registro, pela mesma razao que ja o proibe no TriviuExecutor.
///         - O cofre NAO recebe ETH. Nao ha `receive` nem `fallback`. Um motor
///           futuro que devolva troco em ETH derruba o ciclo inteiro.
///         - `crescimento` NAO e medida de desempenho do ciclo. Ver a nota em
///           `ciclar`.
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @dev Superficie do motor compartilhado (`TriviuExecutor` v0.2), declarada
///      inline: este repositorio nao carrega dependencia externa.
interface ITriviuExecutor {
    enum Dex {
        UniV2,
        UniV3
    }

    struct Leg {
        Dex dex;
        address router;
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountOutMin;
    }

    function executeCycle(
        address asset,
        uint256 principal,
        uint256 minProfit,
        Leg[] calldata legs
    ) external;
}

contract TriviuVault {
    /*//////////////////////////////////////////////////////////////
                                 IMUTAVEIS
    //////////////////////////////////////////////////////////////*/

    /// @notice Quem implantou e possui este cofre. Imutavel: nao ha caminho,
    ///         nem para ele, que transfira a posse.
    address public immutable dono;

    /// @notice Moeda base do cofre. O ciclo abre e fecha nela.
    IERC20 public immutable base;

    /// @notice Quem CRIOU este cofre — a `TriviuFactory` pelo caminho normal.
    ///         Distinto de `dono` de proposito: a fabrica cria, o usuario possui.
    /// @dev    Este endereco tem UM unico poder, exercivel UMA unica vez:
    ///         `definirComandanteInicial`. Ele existe porque o vinculo cofre-cerca
    ///         nao cabe no construtor — a cerca le `dono()` e `base()` DESTE cofre
    ///         na construcao dela, entao o cofre precisa existir primeiro, e o
    ///         apontamento e obrigatoriamente escrita pos-construcao.
    ///
    ///         As duas alternativas para fechar esse ciclo foram recusadas com
    ///         motivo: CREATE2 com endereco pre-computado reverteria o F-3 da
    ///         fabrica e reabriria a ocupacao de endereco; predicao de nonce por
    ///         RLP e matematica esperta no caminho do dinheiro, que falha nos
    ///         limites de nonce (128, 256, 65536) e brickaria a fabrica naquele
    ///         nonce.
    address public immutable criador;

    /*//////////////////////////////////////////////////////////////
                                  ESTADO
    //////////////////////////////////////////////////////////////*/

    /// @notice Motor compartilhado que executa o ciclo atomico. Trocavel pelo
    ///         dono para que ele possa migrar para uma versao auditada nova sem
    ///         depender de nos — e zeravel, que e o freio de mao.
    address public motor;

    /// @notice Unico endereco autorizado a disparar `ciclar`. Zero significa que
    ///         so o dono dispara, pelo caminho normal de quem chama.
    address public comandante;

    /// @dev Bandeira de MAO UNICA do portao do criador. Queima em
    ///      `definirComandanteInicial` E em `definirComandante` — nos DOIS
    ///      caminhos, e isso nao e redundancia.
    ///
    ///      A guarda intuitiva seria `comandante == address(0)`, e ela e um
    ///      buraco medido: `definirComandante(address(0))` e o freio de mao
    ///      documentado do dono, e depois de usa-lo o comandante volta a zero —
    ///      o que REABRIRIA a janela do criador. Um cofre cujo dono puxou o
    ///      freio ficaria com o criador podendo apontar comandante de novo.
    ///      Guarda em `test_D2a_I5_freioDeMaoNaoReabreOportao`.
    ///
    ///      Empacota no slot de `comandante` (offset 20 dos 32 bytes): zero slot
    ///      novo, verificado por `forge inspect TriviuVault storageLayout`.
    bool private _portaoInicialQueimado;

    uint256 private constant _NAO_ENTROU = 1;
    uint256 private constant _ENTROU = 2;
    uint256 private _estado;

    /*//////////////////////////////////////////////////////////////
                                   ERROS
    //////////////////////////////////////////////////////////////*/

    error NaoEDono(address quemChamou, address dono);
    error NaoEComandante(address quemChamou, address comandante);
    error MotorAusente();
    /// @dev O endereco existe mas nao tem codigo. Erro de digitacao no
    ///      `definirMotor` e o engano mais provavel de todos, e sem isto ele so
    ///      aparecia na primeira operacao, como um revert sem nenhum byte de
    ///      motivo.
    error MotorSemCodigo(address informado);
    error QuantiaZero();
    error SaldoInsuficiente(uint256 pedido, uint256 disponivel);
    /// @dev A promessa central falhando. Se este erro aparecer, o motor devolveu
    ///      menos do que levou e o cofre recusou.
    error CofreEncolheu(uint256 antes, uint256 depois);
    error TransferenciaFalhou(address token, address para, uint256 quantia);
    error AprovacaoRecusada(address token, address gastador, uint256 quantia);
    error Reentrante();
    error EnderecoZerado();
    /// @dev O portao inicial e do CRIADOR, e de mais ninguem — inclusive nao e
    ///      do dono, que tem o caminho dele em `definirComandante`.
    error NaoEOcriador(address quemChamou, address criador);
    /// @dev O portao inicial ja foi atravessado, ou o dono ja falou primeiro.
    ///      Nos dois casos ele nao abre de novo.
    error PortaoInicialQueimado();

    /*//////////////////////////////////////////////////////////////
                                  EVENTOS
    //////////////////////////////////////////////////////////////*/

    event Depositado(address indexed dono, uint256 quantia, uint256 saldo);
    event Sacado(address indexed dono, uint256 quantia, uint256 saldo);
    event Resgatado(address indexed token, uint256 quantia);
    event MotorTrocado(address indexed anterior, address indexed novo);
    event ComandanteTrocado(address indexed anterior, address indexed novo);
    /// @dev Emitido ALEM de `ComandanteTrocado`, e nao no lugar dele: quem ja
    ///      indexa a troca continua vendo a troca. Este segundo evento diz o que
    ///      o primeiro nao distingue — que este comandante veio do criador no
    ///      ato da criacao, e nao de uma escolha posterior do dono.
    event ComandanteInicialDefinido(address indexed criador, address indexed comandante);
    /// @dev `crescimento` e a DIFERENCA DE SALDO do cofre, e nada alem disso.
    ///      Zero e resultado valido: significa empate, e empate nao custa nada
    ///      ao dono. Leia a advertencia em `ciclar` antes de consumir este
    ///      numero para qualquer coisa.
    event CicloExecutado(
        address indexed comandante,
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

    modifier naoReentrante() {
        if (_estado == _ENTROU) revert Reentrante();
        _estado = _ENTROU;
        _;
        _estado = _NAO_ENTROU;
    }

    constructor(address dono_, address base_) {
        if (dono_ == address(0) || base_ == address(0)) revert EnderecoZerado();
        dono = dono_;
        base = IERC20(base_);
        criador = msg.sender;
        _estado = _NAO_ENTROU;
    }

    /*//////////////////////////////////////////////////////////////
                              ENTRADA E SAIDA
    //////////////////////////////////////////////////////////////*/

    /// @notice Traz `quantia` da carteira do dono para o cofre.
    /// @dev    Uma transferencia direta para o endereco do cofre tambem funciona
    ///         e e contabilizada igual, porque a verdade e o saldo e nao um
    ///         contador. Esta funcao existe pelo evento e pela intencao
    ///         explicita, nao porque o cofre precise dela.
    /// @param  quantia Unidades da moeda base.
    function depositar(uint256 quantia) external soDono naoReentrante {
        if (quantia == 0) revert QuantiaZero();
        if (!base.transferFrom(msg.sender, address(this), quantia)) {
            revert TransferenciaFalhou(address(base), address(this), quantia);
        }
        emit Depositado(msg.sender, quantia, base.balanceOf(address(this)));
    }

    /// @notice A saida. Sem teto, sem espera, sem aprovacao de ninguem.
    /// @dev    Nao consulta motor, comandante, pausa nem estado de ciclo. Nao ha
    ///         configuracao deste contrato que a impeca.
    /// @param  quantia Unidades da moeda base.
    function sacar(uint256 quantia) external soDono naoReentrante {
        if (quantia == 0) revert QuantiaZero();
        uint256 saldo = base.balanceOf(address(this));
        if (quantia > saldo) revert SaldoInsuficiente(quantia, saldo);
        if (!base.transfer(dono, quantia)) {
            revert TransferenciaFalhou(address(base), dono, quantia);
        }
        emit Sacado(dono, quantia, base.balanceOf(address(this)));
    }

    /// @notice Tira QUALQUER token deste cofre para o dono, sempre.
    /// @dev    Inclui a moeda base: e um superconjunto de `sacar`, mantido
    ///         separado porque a intencao e outra. Token que chegou aqui por
    ///         engano, ou perna de ciclo que ficou presa por defeito de um motor
    ///         futuro, sai por aqui sem depender de nada.
    /// @param  token Endereco do token a resgatar.
    /// @param  quantia Unidades a enviar ao dono.
    function resgatar(address token, uint256 quantia) external soDono naoReentrante {
        if (token == address(0)) revert EnderecoZerado();
        if (quantia == 0) revert QuantiaZero();
        if (!IERC20(token).transfer(dono, quantia)) {
            revert TransferenciaFalhou(token, dono, quantia);
        }
        emit Resgatado(token, quantia);
    }

    /*//////////////////////////////////////////////////////////////
                                 GOVERNANCA
    //////////////////////////////////////////////////////////////*/

    /// @notice Aponta o motor compartilhado. `address(0)` desliga o ciclo.
    /// @dev    Trocavel pelo dono de proposito: ele migra para um motor auditado
    ///         novo quando quiser, sem pedir nada a nos. E o freio de mao dele
    ///         nao depende de nos tambem.
    ///
    ///         Endereco sem codigo e recusado AQUI, e nao na primeira operacao.
    ///         O `extcodesize` que o compilador insere ja fazia a chamada
    ///         reverter — mas revertia com zero bytes de motivo, entao um dedo
    ///         trocado virava silencio em vez de recusa. `address(0)` continua
    ///         valendo: e o freio, nao um engano.
    function definirMotor(address novo) external soDono {
        if (novo != address(0) && novo.code.length == 0) revert MotorSemCodigo(novo);
        emit MotorTrocado(motor, novo);
        motor = novo;
    }

    /// @notice Define quem pode disparar `ciclar`. `address(0)` fecha a porta
    ///         para todos menos o dono.
    /// @dev    ADVERTENCIA que o dono precisa ler antes de usar esta funcao com
    ///         um keeper: apontar um keeper DIRETO aqui entrega a ele o spread
    ///         inteiro de cada ciclo — medido, 100%, em
    ///         `test/MedusaTetoComandantePoC.t.sol::test_PoC_MT1`. O principal
    ///         continua intocavel, e so ele. A `TriviuCerca` existe exatamente
    ///         para ficar neste lugar, e o caminho da `TriviuFactory` ja a poe
    ///         aqui. Quem quiser um keeper deve aponta-lo como OPERADOR DA
    ///         CERCA, e nao como comandante do cofre.
    ///
    ///         A funcao continua livre porque e o freio de mao do dono, e
    ///         prende-lo ao nosso desenho seria pior que o vetor que ela abre.
    ///
    ///         QUEIMA O PORTAO DO CRIADOR, e essa linha nao e opcional. Se o
    ///         dono fala primeiro, o criador perde a vez para sempre. Sem ela,
    ///         um cofre cujo criador nunca chamou `definirComandanteInicial`
    ///         ficaria com uma janela aberta pelo resto da vida do contrato.
    function definirComandante(address novo) external soDono {
        _portaoInicialQueimado = true;
        emit ComandanteTrocado(comandante, novo);
        comandante = novo;
    }

    /// @notice O portao do criador: aponta o comandante inicial UMA unica vez.
    ///         E por aqui que a `TriviuFactory` amarra a `TriviuCerca` recem
    ///         implantada ao cofre recem implantado, na mesma transacao.
    /// @dev    Nao aceita `address(0)`: zero aqui seria queimar o portao sem
    ///         apontar nada, que e a unica chamada sem proposito possivel.
    ///         `address(0)` como freio continua existindo, e vive em
    ///         `definirComandante`, que e do dono.
    ///
    ///         Nao checa `novo.code.length == 0`, e a ausencia e deliberada. O
    ///         irmao `definirMotor` checa porque la um HUMANO digita o endereco.
    ///         Aqui o argumento e sempre o retorno de `new TriviuCerca` na mesma
    ///         transacao — um endereco que acabou de receber codigo. Checar caso
    ///         impossivel e decoracao, e esta casa nao escreve decoracao.
    ///
    ///         PIOR CASO, dito: se este portao fosse acionado com um comandante
    ///         hostil, o teto do dano e o mesmo do cabecalho — spread sim,
    ///         principal nunca — e o dono derruba em UMA transacao com
    ///         `definirComandante`.
    /// @param  novo Comandante inicial. Nao pode ser zero.
    function definirComandanteInicial(address novo) external {
        if (msg.sender != criador) revert NaoEOcriador(msg.sender, criador);
        if (_portaoInicialQueimado) revert PortaoInicialQueimado();
        if (novo == address(0)) revert EnderecoZerado();
        _portaoInicialQueimado = true;
        emit ComandanteTrocado(comandante, novo);
        emit ComandanteInicialDefinido(msg.sender, novo);
        comandante = novo;
    }

    /*//////////////////////////////////////////////////////////////
                                  O CICLO
    //////////////////////////////////////////////////////////////*/

    /// @notice Dispara um ciclo atomico no motor, com capital deste cofre.
    /// @dev    Aprova o exato, chama, zera. Entre a aprovacao e o zeramento nao
    ///         existe reentrada possivel: o guarda esta ligado e cobre as cinco
    ///         funcoes que movem valor.
    ///
    ///         A verificacao de encolhimento e a promessa deste contrato feita
    ///         em bytecode. O motor ja reverte quando o ciclo nao da lucro, mas
    ///         o cofre nao delega a sua unica promessa a um endereco que o dono
    ///         pode trocar.
    /// @dev    `crescimento` NAO E MEDIDA DE DESEMPENHO DO CICLO, e nao pode
    ///         alimentar disjuntor. Ele e a diferenca de saldo, e diferenca de
    ///         saldo nao distingue o que o ciclo produziu do que caiu no cofre
    ///         por outro caminho. A Medusa provou em c406dbbe: uma doacao de 42
    ///         durante a chamada apareceu como 42 de "lucro" num ciclo que
    ///         produziu zero.
    ///
    ///         Isso importa porque o executor por-usuario da fase 4 preve
    ///         disjuntores de perda — `consecutiveLosses`, `lossCooldown`,
    ///         `dailyLossLimit`. Um disjuntor alimentado por este numero e
    ///         desarmavel com poeira: o adversario doa e zera o contador.
    ///
    ///         Quem precisar do lucro REAL le o evento `CycleExecuted` do motor,
    ///         que mede o que o ciclo produziu.
    /// @param  principal Capital a arriscar no ciclo, na moeda base.
    /// @param  minProfit Lucro minimo exigido; o motor reverte abaixo disso.
    /// @param  legs      Pernas tipadas do ciclo, fechando na moeda base.
    /// @return crescimento Diferenca de saldo do cofre. Zero e empate valido.
    function ciclar(
        uint256 principal,
        uint256 minProfit,
        ITriviuExecutor.Leg[] calldata legs
    ) external naoReentrante returns (uint256 crescimento) {
        if (msg.sender != dono && msg.sender != comandante) {
            revert NaoEComandante(msg.sender, comandante);
        }
        address m = motor;
        if (m == address(0)) revert MotorAusente();
        if (principal == 0) revert QuantiaZero();

        uint256 antes = base.balanceOf(address(this));
        if (principal > antes) revert SaldoInsuficiente(principal, antes);

        _aprovaExato(m, principal);
        ITriviuExecutor(m).executeCycle(address(base), principal, minProfit, legs);
        _aprovaExato(m, 0);

        uint256 depois = base.balanceOf(address(this));
        if (depois < antes) revert CofreEncolheu(antes, depois);
        crescimento = depois - antes;

        emit CicloExecutado(msg.sender, principal, minProfit, crescimento);
    }

    /*//////////////////////////////////////////////////////////////
                                  INTERNO
    //////////////////////////////////////////////////////////////*/

    /// @dev Zera antes de definir: alguns tokens recusam mudar allowance de
    ///      nao-zero para nao-zero. O retorno e checado pelo mesmo motivo que o
    ///      de toda transferencia neste arquivo — um token que responde `false`
    ///      em vez de reverter falharia adiante, culpando o inocente.
    function _aprovaExato(address gastador, uint256 quantia) private {
        if (!base.approve(gastador, 0)) {
            revert AprovacaoRecusada(address(base), gastador, 0);
        }
        if (quantia != 0 && !base.approve(gastador, quantia)) {
            revert AprovacaoRecusada(address(base), gastador, quantia);
        }
    }
}
