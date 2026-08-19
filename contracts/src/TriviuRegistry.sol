// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {TriviuFactory} from "./TriviuFactory.sol";

/*//////////////////////////////////////////////////////////////////////////
      TRIVIU REGISTRY v0.1
      PRE-MAINNET, NAO AUDITADO EXTERNAMENTE. Fork local apenas.
//////////////////////////////////////////////////////////////////////////*/

/// @dev Superficie do ParameterRegistry que este contrato usa. Declarada
///      inline: o repositorio nao carrega dependencia externa.
interface IParametros {
    function isAllowedToken(address token) external view returns (bool);
}

/// @title  TriviuRegistry
/// @notice A porta de entrada. Escreve o usuario no protocolo e manda implantar
///         o cofre dele — e sai do caminho.
///
/// @dev    O QUE ESTE CONTRATO NAO FAZ:
///
///         - NAO guarda saldo. Nenhuma funcao move token.
///         - NAO tem dono, nao tem pausa, nao tem funcao administrativa. Nao ha
///           admin no caminho do dinheiro de ninguem, porque nao ha caminho de
///           dinheiro passando por aqui.
///         - NAO consegue tocar o cofre depois de criado. Ele nasce com `dono`
///           imutavel apontando para o usuario, e este contrato nao aparece em
///           nenhum controle de acesso dele.
///
///           PRECISAO exigida desde 2026-08-12: a FABRICA aparece, e o registro
///           nao. O cofre grava `criador = msg.sender`, que e a fabrica, e esse
///           papel tem UM poder — `definirComandanteInicial` — exercivel UMA vez
///           e queimado no mesmo ato pela propria fabrica, dentro da transacao
///           de criacao. Depois que a transacao fecha, a fabrica tambem nao
///           alcanca mais nada. Dizer "ninguem alem do dono toca o cofre" sem
///           esta ressalva seria afirmacao mais forte que o bytecode.
///         - NAO permite dois cofres do mesmo usuario na mesma moeda base. A
///           segunda tentativa reverte NOMEANDO o cofre que ja existe, em vez de
///           criar um irmao silencioso que confunde qual e o de verdade.
///
/// @dev    A FABRICA NASCE AQUI, e isso fecha dois achados de uma vez. O
///         construtor implanta a `TriviuFactory` passando `address(this)`, entao
///         o vinculo entre registro e fabrica e feito no mesmo ato de criacao,
///         com os dois lados imutaveis. Nao existe janela entre implantar e
///         amarrar, nao existe setter, e nao existe fabrica orfã que alguem
///         possa chamar por fora (F-2), nem caminho paralelo em que registro e
///         fabrica discordem sobre o que existe (F-5).
///
/// @dev    ESCOPO DECLARADO, e a contagem mudou em 2026-08-12: hoje o usuario
///         recebe DOIS contratos — o cofre e a cerca que o comanda. Ate aquela
///         data era um, e este paragrafo dizia isso. O executor por-usuario e o
///         cofre de indicacao continuam nao existindo. Este contrato nao chama
///         dois de triade — o console esta sob veto de Lei #1 por exatamente
///         esse tipo de afirmacao, e o conserto nao comeca repetindo o erro do
///         outro lado.
///
///         O QUE A CERCA JUNTO NAO SIGNIFICA: ela nasce PAUSADA, sem operador e
///         com todo campo de politica em zero. Ela nao opera, nao e convite para
///         operar, e nao promete lucro. Ela existe para que o caminho padrao
///         deixe de entregar o spread inteiro a um keeper apontado direto no
///         cofre — vetor medido em
///         `test/MedusaTetoComandantePoC.t.sol::test_PoC_MT1`.
contract TriviuRegistry {
    /// @notice Whitelist de moedas base, compartilhada com o executor.
    IParametros public immutable parametros;

    /// @notice Fabrica implantada por este registro, na construcao dele.
    TriviuFactory public immutable fabrica;

    struct Conta {
        bool registrado;
        uint40 desde;
    }

    mapping(address => Conta) public contas;

    /// @notice dono => moeda base => cofre. Zero significa que nao existe.
    mapping(address => mapping(address => address)) public cofreDe;

    /// @notice Todos os cofres criados, em ordem. Existe para auditoria: sem
    ///         isto, saber quantos cofres a fabrica produziu exige varrer logs.
    address[] public cofres;

    error Reentrante();
    error JaRegistrado(address quem);
    error NaoRegistrado(address quem);
    error BaseNaoPermitida(address token);
    error CofreJaExiste(address dono, address base, address cofre);
    error EnderecoZerado();

    uint256 private constant _NAO_ENTROU = 1;
    uint256 private constant _ENTROU = 2;
    uint256 private _estado;

    /// @notice dono => moeda base => cerca. Zero significa que nao existe.
    /// @dev    DECLARADO AQUI, DEPOIS DE `_estado`, E O LUGAR IMPORTA.
    ///
    ///         O lugar natural seria ao lado de `cofreDe`, e ele empurra
    ///         `_estado` do slot 3 para o 4 — medido com
    ///         `forge inspect TriviuRegistry storageLayout`, movendo o mapa e
    ///         lendo a tabela. `test_MF1_guardaDeReentranciaDispara` fixa o
    ///         slot 3 na mao com `vm.store`, entao passaria a escrever num slot
    ///         que nao e mais o sinalizador.
    ///
    ///         O QUE ACONTECE ENTAO FOI MEDIDO, e nao e o que este paragrafo
    ///         dizia ate 2026-08-12. Ele afirmava "verde sem mecanismo" — o
    ///         teste seguiria passando sem exercitar o guarda. FALSO: com o
    ///         mapa moved e o layout deslocado, o teste fica VERMELHO,
    ///         `next call did not revert as expected`. Ele afirma um revert
    ///         positivo, entao falha FECHADO por construcao. A frase errada
    ///         fica registrada porque ela sustentava esta decisao, e uma
    ///         decisao apoiada em consequencia falsa precisa ser reexaminada,
    ///         nao silenciosamente mantida.
    ///
    ///         REEXAMINADA, A DECISAO FICA DE PE, por dois motivos que sobrevivem
    ///         ao conserto: o vermelho nao nomeia a causa — quem o encontrar ve
    ///         "nao reverteu" e vai procurar defeito no guarda, nao no layout —
    ///         e a garantia so vale para teste que afirme revert. Um teste
    ///         futuro que leia o slot para conferir valor ficaria verde e
    ///         errado. Declarar por ultimo elimina a classe inteira: todo campo
    ///         novo entra depois do sinalizador, e nenhum empurra o que ja
    ///         existe. O teste tambem passou a CONFERIR o slot antes de
    ///         escrever, para que o acidente diga o que foi.
    mapping(address => mapping(address => address)) public cercaDe;

    /// @dev MF-1 da Medusa. `implantarCofre` checa a duplicata ANTES da chamada
    ///      a fabrica e grava o resultado DEPOIS — Checks-Effects-Interactions
    ///      invertido, porque o endereco do cofre so existe depois de criado.
    ///
    ///      Hoje isso nao e explorável: o construtor do `TriviuVault` nao faz
    ///      chamada externa nenhuma, entao nao ha de onde reentrar. Amanha e:
    ///      basta o construtor tocar um endereco fornecido pelo usuario — ler
    ///      `decimals()` do token base e a mudanca mais banal que existe — para
    ///      um token malicioso reentrar durante a construcao, passar pela
    ///      checagem porque o mapa ainda esta vazio, e produzir DOIS cofres para
    ///      o mesmo par com so o ultimo registrado. Um cofre que existe na
    ///      cadeia e que o registro nao conhece.
    ///
    ///      O guarda fecha a classe inteira em vez de uma instancia, e usa o
    ///      mesmo padrao que os dois cofres ja usam — quem le o repositorio ja
    ///      conhece o modificador.
    modifier naoReentrante() {
        if (_estado == _ENTROU) revert Reentrante();
        _estado = _ENTROU;
        _;
        _estado = _NAO_ENTROU;
    }

    event Registrado(address indexed dono, uint40 quando);
    event CofreCriado(
        address indexed dono, address indexed base, address cofre, uint256 indice
    );

    constructor(address parametros_) {
        if (parametros_ == address(0)) revert EnderecoZerado();
        parametros = IParametros(parametros_);
        fabrica = new TriviuFactory(address(this));
        _estado = _NAO_ENTROU;
    }

    /// @notice Escreve quem chama no protocolo.
    /// @dev    Sem campo de patrocinador e sem recompensa por trazer alguem. O
    ///         cofre de indicacao, quando existir, paga sobre lucro realizado de
    ///         quem ja escolheu estar aqui — nao sobre cadastro.
    function registrar() external {
        if (contas[msg.sender].registrado) revert JaRegistrado(msg.sender);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint40 agora = uint40(block.timestamp);
        contas[msg.sender] = Conta({registrado: true, desde: agora});
        emit Registrado(msg.sender, agora);
    }

    /// @notice Implanta o cofre de quem chama, na moeda base escolhida, JUNTO
    ///         com a cerca que o comanda.
    /// @dev    `msg.sender` vai direto para a fabrica como dono. Nao ha
    ///         parametro de dono nesta funcao, de proposito: parametro de dono e
    ///         o que permitiria implantar cofre no nome de outra pessoa.
    ///
    ///         A CERCA VEM JUNTO desde 2026-08-12. O cofre nasce comandado por
    ///         ela, e ela nasce PAUSADA e sem operador — nenhum ciclo atravessa
    ///         ate o dono armar. `depositar` e `sacar` nao dependem dela e
    ///         funcionam desde o primeiro bloco.
    ///
    ///         A duplicata continua checada so por `cofreDe`, e nao pelos dois
    ///         mapas. Os dois sao escritos na mesma transacao pela mesma
    ///         chamada, entao um par divergente nao tem como existir: nao ha
    ///         caminho que grave um sem o outro.
    ///
    ///         POR QUE `CofreCriado` NAO GANHOU UM CAMPO `cerca`, e por que nao
    ///         ha evento novo aqui: o endereco da cerca ja sai na MESMA
    ///         transacao, em `TriviuFactory.CercaImplantada`, com o mesmo `dono`
    ///         indexado. Quem indexa esta cadeia ja precisa ler os eventos da
    ///         fabrica de qualquer forma — e de la que vem o `codehash` que da
    ///         procedencia ao cofre. Evento novo aqui repetiria dado que ja
    ///         existe no mesmo recibo, e o Art. 4 da Pantera pede evento para
    ///         mutacao observavel, nao dois eventos para o mesmo fato.
    /// @param  base Moeda base do cofre. Precisa estar na whitelist.
    /// @return cofre Endereco do cofre recem-criado.
    /// @return cerca Endereco da cerca recem-criada, ja comandante do cofre.
    function implantarCofre(address base)
        external
        naoReentrante
        returns (address cofre, address cerca)
    {
        if (!contas[msg.sender].registrado) revert NaoRegistrado(msg.sender);
        if (!parametros.isAllowedToken(base)) revert BaseNaoPermitida(base);

        address existente = cofreDe[msg.sender][base];
        if (existente != address(0)) {
            revert CofreJaExiste(msg.sender, base, existente);
        }

        (cofre, cerca) = fabrica.implantarCofre(msg.sender, base);
        cofreDe[msg.sender][base] = cofre;
        cercaDe[msg.sender][base] = cerca;
        cofres.push(cofre);
        emit CofreCriado(msg.sender, base, cofre, cofres.length - 1);
    }

    /// @notice Quantos cofres este registro ja criou.
    function totalDeCofres() external view returns (uint256) {
        return cofres.length;
    }

    /// @notice Se `quem` esta escrito no protocolo.
    function estaRegistrado(address quem) external view returns (bool) {
        return contas[quem].registrado;
    }
}
