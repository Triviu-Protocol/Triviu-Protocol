// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {TriviuVault} from "./TriviuVault.sol";
import {TriviuCerca} from "./TriviuCerca.sol";

/*//////////////////////////////////////////////////////////////////////////
      TRIVIU FACTORY v0.1
      PRE-MAINNET, NAO AUDITADA EXTERNAMENTE. Fork local apenas.
//////////////////////////////////////////////////////////////////////////*/

/// @title  TriviuFactory
/// @notice Implanta o cofre do usuario. Sai do caminho no mesmo bloco: nao
///         guarda saldo, nao e dona de nada, e nao tem funcao administrativa.
///
/// @dev    Contrato que implanta contrato para terceiro e uma classe de risco
///         propria: o produto da funcao e codigo novo na cadeia, com dono novo,
///         e o erro nao aparece na chamada — aparece na vida do contrato que ela
///         criou, que e imutavel e de outra pessoa. Os quatro achados do modelo
///         de ameaca do Tubarao-branco viraram construcao, e nao comentario:
///
///         F-1 · O BYTECODE NAO VEM DE FORA. `new TriviuVault(...)` fixa o tipo
///         em tempo de compilacao. Nao ha parametro `bytes`, nao ha `create` de
///         baixo nivel, nao ha `delegatecall`. Uma fabrica que aceita bytecode
///         deixa de ser fabrica e vira implantador universal — e ai a procedencia
///         do deploy nao significa mais nada.
///
///         F-2 · QUEM CHAMA NAO ESCOLHE O DONO. Duas travas, nao uma: so o
///         registro chama esta fabrica, E e o registro que passa o `msg.sender`
///         dele. Sem as duas, um atacante implanta cofre cujo dono e a vitima —
///         nao e roubo, ela e dona, mas e procedencia envenenada.
///
///         F-3 · ENDERECO NAO E PREVISIVEL. `new` usa CREATE, que deriva do
///         nonce desta fabrica. Com CREATE2 e sal derivado do usuario, o
///         endereco do cofre dele seria calculavel antes de existir, e um
///         atacante ocuparia primeiro com a moeda base errada por custo de gas.
///         Endereco estavel nao vale esse preco aqui.
///
///         F-4 · A IDENTIDADE DO BYTECODE VIAJA COM O CONTRATO. Esta fabrica
///         e dependencia permanente de tudo que ela cria: um defeito aqui
///         atinge contratos imutaveis de terceiros que ninguem pode corrigir. O
///         `codehash` do cofre recem-criado sai em cada evento para que, no dia
///         do defeito, dê para saber exatamente quem esta exposto.
///
///         TN-2 do Tubarao-branco: existia tambem um `VERSAO` — string
///         constante "TriviuVault v0.1" — no mesmo evento. Ela SAIU. Nada a
///         prendia ao bytecode que ela dizia descrever: bastava alterar o cofre
///         e esquecer de bumpar, e o evento passava a carregar um campo
///         mecanicamente verdadeiro ao lado de um que mente. Numero de versao
///         que ninguem consegue verificar contra a realidade e ruido com cara de
///         procedencia — e procedencia era o unico motivo de o campo existir.
///
///         MF-2 da Medusa: a versao anterior congelava
///         `keccak256(type(TriviuVault).creationCode)` num imutavel, e isso
///         obrigava o compilador a embutir o codigo de criacao do cofre uma
///         SEGUNDA vez — medido: 5.876 bytes, quase o cofre inteiro de novo, com
///         a fabrica indo a 11.832. Com tres contratos por triade a projecao
///         passava de 38 KB contra o teto de 49.152 do EIP-3860.
///
///         O `codehash` do endereco recem-criado custa 100 de gas, zero de
///         initcode, e prova MAIS: ele e o codigo que de fato ficou na cadeia,
///         nao o que a fabrica pretendia implantar.
///
/// @dev    O QUE ELA IMPLANTA HOJE, contado: DOIS contratos por usuario — o
///         `TriviuVault` e a `TriviuCerca` que o comanda. Ate 2026-08-12 era um
///         so, e este paragrafo dizia isso; a contagem mudou junto com o codigo,
///         no mesmo commit, porque contagem em cabecalho envelhece calada.
///
///         Continua NAO sendo triade, e o nome da funcao continua dizendo
///         `Cofre`: o executor por-usuario e o cofre de indicacao ainda nao
///         foram escritos. Nomear tres coisas quando existem duas e a mesma
///         classe de afirmacao que pos o console sob veto. Quando as outras
///         existirem, entra funcao nova com nome novo; esta nao muda de
///         significado em silencio.
///
///         MF-2 CONTINUA HONRADO, e foi RE-MEDIDO nesta onda com
///         `forge build --sizes`, antes e depois, e nao herdado de estimativa.
///         O achado da Medusa derrubou uma versao que congelava
///         `keccak256(type(TriviuVault).creationCode)` num imutavel, porque isso
///         obrigava o compilador a embutir o codigo de criacao do cofre uma
///         SEGUNDA vez — 5.876 bytes.
///
///         Embutir o `creationCode` da cerca UMA vez e o preco inevitavel de
///         `new TriviuCerca`. Medido:
///
///           TriviuFactory  runtime   5.911 -> 13.930   (EIP-170  24.576)
///           TriviuFactory  initcode  6.093 -> 14.113
///           TriviuRegistry runtime   1.749 ->  1.900
///           TriviuRegistry initcode  8.123 -> 16.294   (EIP-3860 49.152)
///           TriviuVault    runtime   4.879 ->  5.343
///           TriviuCerca    runtime   6.546 ->  6.546   (intocada)
///
///         A fabrica e a maior, com folga de 10.646 bytes para o EIP-170; o
///         initcode do registro que a cria tem folga de 32.858 para o EIP-3860.
///         Passa com folga — e quem for congelar `creationCode` em imutavel aqui
///         refaz esta conta antes, porque a duplicacao volta.
contract TriviuFactory {
    /// @notice Unico endereco autorizado a mandar implantar. Imutavel e definido
    ///         no construtor pelo proprio registro, que se implanta como dono
    ///         desta fabrica — nao existe janela entre criar e amarrar.
    address public immutable registro;

    error NaoEOregistro(address quemChamou, address registro);
    error EnderecoZerado();

    /// @dev `hashDoCodigo` e o `codehash` do cofre recem-criado: o codigo que
    ///      de fato ficou na cadeia, e nao o que a fabrica pretendia implantar.
    event CofreImplantado(
        address indexed dono,
        address indexed cofre,
        address indexed base,
        bytes32 hashDoCodigo
    );

    /// @dev Mesma logica do irmao acima: `hashDoCodigo` e o `codehash` da cerca
    ///      recem-criada, o codigo que de fato ficou na cadeia. A cerca e tao
    ///      imutavel e tao de terceiro quanto o cofre, entao carrega a mesma
    ///      procedencia — no dia de um defeito, da para saber quem esta exposto.
    event CercaImplantada(
        address indexed dono,
        address indexed cofre,
        address indexed cerca,
        bytes32 hashDoCodigo
    );

    constructor(address registro_) {
        if (registro_ == address(0)) revert EnderecoZerado();
        registro = registro_;
    }

    modifier soRegistro() {
        if (msg.sender != registro) revert NaoEOregistro(msg.sender, registro);
        _;
    }

    /// @notice Implanta o PAR do usuario — cofre e cerca — e amarra um ao outro
    ///         na mesma transacao.
    /// @dev    O `dono` vem do registro, que o le do `msg.sender` dele. Esta
    ///         fabrica nao tem como saber quem e o usuario final e nao tenta
    ///         adivinhar — ela confia no unico endereco que pode chama-la, e
    ///         esse endereco foi amarrado na construcao.
    ///
    ///         POR QUE A CERCA NASCE AQUI, e nao e conveniencia. Um cofre
    ///         entregue cru convida o caminho natural
    ///         `definirComandante(keeper)`, e esse caminho entrega ao keeper
    ///         100% do spread de cada ciclo — medido em
    ///         `test/MedusaTetoComandantePoC.t.sol::test_PoC_MT1`, com o
    ///         principal intacto e a tesouraria em zero. A porta atomica do
    ///         cofre guarda o principal e nunca guardou o spread. Quem guarda o
    ///         spread e o `pisoDeLucroBps` da cerca. Entregar o par por padrao
    ///         tira esse vetor do caminho de quem nao sabe que ele existe.
    ///
    ///         A ORDEM E FORCADA, nao escolhida: a cerca le `dono()` e `base()`
    ///         do cofre no construtor dela, logo o cofre existe primeiro; e o
    ///         cofre so pode conhecer a cerca depois de ela existir, logo o
    ///         vinculo e obrigatoriamente escrita pos-construcao. Dai o portao
    ///         de mao unica `definirComandanteInicial`, que so o criador
    ///         atravessa e so uma vez.
    ///
    ///         O QUE ISTO NAO FAZ, dito antes que alguem leia "resolvido": o
    ///         dono continua podendo chamar `cofre.definirComandante(keeper)` e
    ///         reabrir o vetor inteiro. E o freio de mao dele. Mudou o PADRAO,
    ///         nao a possibilidade. E a cerca CORTA no piso, nao zera: o
    ///         residual e `spread - principal * bps / 10000`.
    ///
    ///         A CERCA NASCE INOPERANTE, e isso e o comportamento certo:
    ///         pausada, sem operador, com piso, teto, gas e dias em zero. Nenhum
    ///         ciclo atravessa ate o dono armar os quatro campos e despausar.
    ///         Nascer operavel exigiria esta fabrica escolher um operador — um
    ///         keeper NOSSO — e entregaria o teto acima por padrao a todo
    ///         usuario, no ato da criacao. `depositar` e `sacar` funcionam desde
    ///         o primeiro bloco e nao dependem da cerca.
    ///
    ///         MF-3 da Medusa, RE-MEDIDO nesta onda e nao herdado: implantar o
    ///         par custa 2.657.195 de gas pelo caminho do registro, contra
    ///         1.122.304 do cofre sozinho — 2,37x. As duas pontas foram medidas
    ///         aqui, a de "antes" numa arvore de trabalho no commit anterior,
    ///         pelo mesmo teste (`test_F6_custoDeImplantacaoAbaixoDoTetoDeclarado`).
    ///
    ///         O numero anterior deste comentario dizia "cerca de 1.117.000", e
    ///         deixa-lo aqui repetiria o defeito que abriu esta onda: cabecalho
    ///         afirmando o que o codigo nao faz.
    ///
    ///         O QUE ISSO CUSTA A QUEM ASSINA: mais que o dobro. Convertido, a
    ///         277.208.273.002 wei por gas — preco medido na Polygon 137 em
    ///         2026-08-12 — sao 0,3111 POL antes e 0,7366 POL depois.
    ///
    ///         AS DUAS GRANDEZAS DESTE PARAGRAFO NAO ENVELHECEM IGUAL, e por
    ///         isso a data acompanha uma so. O GAS e propriedade do bytecode:
    ///         muda quando o codigo muda, e
    ///         `test_F6_custoDeImplantacaoAbaixoDoTetoDeclarado` reprova quando
    ///         o custo passa do teto.
    ///         O POL e grandeza de mercado: envelhece sozinho, sem ninguem
    ///         tocar em nada, e nenhum teste o guarda. Quem repetir a conta
    ///         refaz o preco — nao herde este numero, que e o mesmo erro de
    ///         herdar estimativa que a Medusa achou em MF-3.
    ///
    ///         A tela TEM de mostrar a estimativa antes da assinatura, com o
    ///         gas do momento e nao com este, e dizer que o valor cobre DOIS
    ///         contratos, e nao um. A funcao continua sem teto de
    ///         quantidade; encher o registro e caro para quem enche e nao degrada
    ///         mais ninguem — nao ha iteracao on-chain sobre a lista de cofres.
    /// @param  dono Quem sera dono do cofre E da cerca. Imutavel nos dois.
    /// @param  base Moeda base do cofre.
    /// @return cofre Endereco do cofre recem-criado.
    /// @return cerca Endereco da cerca recem-criada, ja apontada como comandante.
    function implantarCofre(address dono, address base)
        external
        soRegistro
        returns (address cofre, address cerca)
    {
        TriviuVault v = new TriviuVault(dono, base);
        TriviuCerca c = new TriviuCerca(address(v));
        v.definirComandanteInicial(address(c));

        cofre = address(v);
        cerca = address(c);

        emit CofreImplantado(dono, cofre, base, cofre.codehash);
        emit CercaImplantada(dono, cofre, cerca, cerca.codehash);
    }
}
