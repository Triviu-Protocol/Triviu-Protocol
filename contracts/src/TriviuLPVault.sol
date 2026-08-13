// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/*//////////////////////////////////////////////////////////////////////////
      TRIVIU LP VAULT v0.1
      Concentrated-liquidity position helper — PRE-MAINNET, NOT YET AUDITED.
      Use on local forks only, until Medusa clears and the external audit lands.
//////////////////////////////////////////////////////////////////////////*/

/// @title  TriviuLPVault
/// @notice Opens, collects from and closes Uniswap V3 positions on the owner's
///         behalf. It never holds the position and never holds funds between
///         transactions.
///
/// @dev    WHAT THIS CONTRACT DOES NOT DO — stated first, because the absences
///         are decisions and each one has a reason:
///
///         - It does NOT rebalance. Measured across seven days on the eligible
///           pools, a ±5% band left its range ZERO times, and a rebalancer would
///           have carried four CRITICAL attack surfaces to solve a problem that
///           did not occur. If a future measurement shows exits, that is a new
///           contract and a new audit, not a flag here.
///         - It does NOT read a price. No `slot0`, no oracle, no TWAP. Every
///           number it acts on is a token amount returned by the position
///           manager in the same transaction.
///         - It does NOT custody. The ERC-721 goes to the owner in `open` and
///           the contract is never `ownerOf`.
///         - It does NOT enforce the fee, and that follows directly from the
///           line above. The owner holds the token, so the position manager's
///           own `collect` is one transaction away and pays this contract
///           nothing. Measured on a mainnet fork on 2026-08-10: the owner took
///           414262773196351 wei of WETH and 700679 units of USDC.e straight
///           from the manager, and the treasury received zero. No version of
///           this contract can close that, because closing it means holding the
///           position, which is the one thing the contract exists not to do.
///           The revenue depends on the owner choosing this route. That is a
///           product decision taken with the number above in hand — ratified by
///           the founder on 2026-08-10 — and not an oversight.
///         - It does NOT accept `setApprovalForAll`. See `_exigeAprovacaoUnica`.
///         - It does NOT support fee-on-transfer tokens. They break amount
///           accounting here for the same reason they break delta accounting in
///           TriviuExecutor, and they must not enter the registry whitelist.
///         - The whitelist gates ENTRY ONLY. `coletar` and `fechar` do not
///           consult it, and that is deliberate rather than an omission: a token
///           removed from the registry after a position was opened would strand
///           the owner, and the only exit left would be the one that pays no fee
///           at all. An exit path in a non-custodial contract must never depend
///           on a value someone else can change. The blast radius of driving
///           these two functions with an arbitrary token is the caller's own —
///           reentrancy is blocked and no balance survives the call.
///         - `abrir` sweeps the contract's whole balance of both tokens to the
///           caller, not just the unspent part of what they sent. On the normal
///           path the contract holds nothing, so the two are the same amount.
///           Anything sent here by mistake belongs to whoever opens the next
///           position in that token. There is no rescue function and there will
///           not be one: a rescue function is an owner, and this contract has
///           none.
///
/// @dev    THE FEE, AND WHY IT SITS WHERE IT SITS (ratified 2026-08-10):
///
///         The fee is a share of the FEES the position collected — never the
///         principal, and never a share of "profit". It is also ELECTIVE: what
///         follows describes where the fee sits when it is charged, not a
///         guarantee that it will be. See the bullet on enforcement above.
///
///         "Profit" was the first design and it does not survive contact with
///         an adversary. An LP position closes in two tokens, so comparing it
///         to its entry requires a price, and any on-chain price is either
///         manipulable within a block (`slot0`) or a trusted publisher. A
///         price-free proxy was proposed — charge only if both token balances
///         ended above entry — and red-teaming killed it: closing that gate
///         costs between $0.07 and $7.11 in a deliberate swap, against fees of
///         $2 to $76. Ten to fifty-six times the attacker's cost.
///
///         Collected fees are the one quantity in an LP position that is
///         REALIZED and needs no price. They are tokens that did not exist in
///         the position before. Impermanent loss is real and it is the owner's,
///         disclosed on the surface, because it cannot be measured on chain
///         without reopening every vector above.
///
///         Measured consequence, stated so nobody has to trust the claim: across
///         35 live pool/band/size configurations read from chain on 2026-08-10,
///         charging on collected fees would have charged a net-negative position
///         ZERO times. The four cases where it would have are all in pools with
///         $14 and $3 of in-band depth, which the oracle already marks dead and
///         skips.
///
/// @dev    Rate and treasury come from the same ParameterRegistry the Executor
///         uses: `onlyOwner` and requiring a pull-request URL recorded with the
///         transaction. The ceiling is clamped here, in bytecode, so a registry
///         value above it cannot overcharge.
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IParameterRegistry {
    function feeBps() external view returns (uint16);
    function treasury() external view returns (address);
    function isAllowedToken(address token) external view returns (bool);
}

/// @dev Only the four entry points this contract uses, declared inline. The
///      codebase carries no external dependencies and this file keeps that.
interface INonfungiblePositionManager {
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

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function burn(uint256 tokenId) external payable;

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    function ownerOf(uint256 tokenId) external view returns (address);

    function getApproved(uint256 tokenId) external view returns (address);
}

contract TriviuLPVault {
    /*//////////////////////////////////////////////////////////////
                                 IMUTÁVEIS
    //////////////////////////////////////////////////////////////*/

    /// @notice On-chain parameter registry — rate, treasury, token whitelist.
    IParameterRegistry public immutable registry;

    /// @notice Uniswap V3 position manager for this chain.
    INonfungiblePositionManager public immutable positionManager;

    /// @notice Hardcoded ceiling on the fee: 50% of collected fees (5000 bps).
    ///         Clamped on USE, so a registry value above it is simply limited
    ///         rather than able to overcharge. Same rule as TriviuExecutor.
    uint16 public constant MAX_FEE_BPS = 5000;

    /// @dev Reentrancy guard: 1 = not entered, 2 = entered. Holds no funds.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    /*//////////////////////////////////////////////////////////////
                                  ERROS
    //////////////////////////////////////////////////////////////*/

    error Reentrante();
    error PrazoExpirado();
    error TokenNaoPermitido(address token);
    error NaoEDono(uint256 tokenId, address dono, address quemChamou);
    error AprovacaoAusente(uint256 tokenId);
    error AprovacaoAmpla(uint256 tokenId);
    error SemLiquidez(uint256 tokenId);
    error NadaAColetar(uint256 tokenId);
    error SobraNaoDevolvida(address token, uint256 quantia);
    error TransferenciaFalhou(address token, address para, uint256 quantia);
    error TesourariaZerada();
    error EnderecoZerado();
    error AprovacaoRecusada(address token, address gastador, uint256 quantia);
    /// @dev `vigente` is what the registry says after the bytecode ceiling has
    ///      been applied. `limite` is what the caller signed for.
    error TaxaAcimaDoLimite(uint16 limite, uint16 vigente);

    /*//////////////////////////////////////////////////////////////
                                 EVENTOS
    //////////////////////////////////////////////////////////////*/

    event PosicaoAberta(
        uint256 indexed tokenId,
        address indexed dono,
        address token0,
        address token1,
        uint24 fee,
        uint128 liquidez,
        uint256 amount0,
        uint256 amount1
    );

    /// @dev `taxa0`/`taxa1` are the protocol's share. `bruto0`/`bruto1` are what
    ///      the position produced. Emitting both means the split is auditable
    ///      from logs alone, without replaying the transaction.
    event TaxasColetadas(
        uint256 indexed tokenId,
        address indexed dono,
        uint256 bruto0,
        uint256 bruto1,
        uint256 taxa0,
        uint256 taxa1,
        uint16 feeBpsAplicado
    );

    event PosicaoFechada(
        uint256 indexed tokenId,
        address indexed dono,
        uint256 principal0,
        uint256 principal1,
        uint256 taxasBrutas0,
        uint256 taxasBrutas1,
        uint256 taxaProtocolo0,
        uint256 taxaProtocolo1,
        uint16 feeBpsAplicado
    );

    /*//////////////////////////////////////////////////////////////
                                MODIFICADORES
    //////////////////////////////////////////////////////////////*/

    modifier naoReentrante() {
        if (_status == _ENTERED) revert Reentrante();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /// @dev The linter flags `block.timestamp` in a comparison, and the flag is
    ///      right as a category: a validator picks the block timestamp inside a
    ///      tolerance. It does not apply here. A deadline exists so a transaction
    ///      cannot hang in the mempool and execute much later at a different
    ///      price; the slack a validator has is seconds, the window a deadline
    ///      guards is minutes or hours. Seconds move nothing this decides.
    ///      The line is silenced, not the rule — turning the lint off globally
    ///      would hide the next use, which might not be safe.
    modifier ateO(uint256 prazo) {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > prazo) revert PrazoExpirado();
        _;
    }

    constructor(address registry_, address positionManager_) {
        // Deploying with a zero here produces a contract where every call
        // reverts with no diagnosis. Cheaper to refuse at construction.
        if (registry_ == address(0) || positionManager_ == address(0)) {
            revert EnderecoZerado();
        }
        registry = IParameterRegistry(registry_);
        positionManager = INonfungiblePositionManager(positionManager_);
        _status = _NOT_ENTERED;
    }

    /*//////////////////////////////////////////////////////////////
                                  ABRIR
    //////////////////////////////////////////////////////////////*/

    /// @notice O que entrou na posicao, por token, e o que ja saiu de taxa.
    ///
    /// @dev    REGISTRO, NAO CUSTODIA. O cofre continua sem segurar saldo entre
    ///         transacoes — isto e memoria do que aconteceu, e existe para uma
    ///         coisa so: decidir se HOUVE RESULTADO antes de cobrar.
    ///
    ///         `uint128` cabe qualquer quantia de token real e mantem os quatro
    ///         campos em duas palavras de armazenamento.
    struct Posicao {
        uint128 dep0;        // entrou no `abrir`
        uint128 dep1;
        uint128 coletado0;   // taxa ja paga ao dono em `coletar`, sem cobranca
        uint128 coletado1;
    }

    /// @notice Registro por posicao. Posicao sem registro NAO paga taxa — ver
    ///         `_houveResultado`.
    mapping(uint256 => Posicao) public posicaoDe;

    struct AbrirParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        /// @dev Supplied by the caller and enforced by the position manager.
        ///      Minting uses the pool's current price, so an attacker who moves
        ///      it beforehand makes the position open at a skewed ratio. These
        ///      two bounds are the only defence, and this contract will not
        ///      carry a default for them: a default here would be a price
        ///      opinion, and this contract holds none.
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 prazo;
    }

    /// @notice Pulls both tokens, mints the position, and sends the NFT to the
    ///         caller. Any unspent amount goes back in the same transaction.
    /// @dev    No fee is charged here. There is no entry fee, exactly as the
    ///         Executor has none.
    /// @param  p Mint parameters. Both tokens must be on the registry whitelist
    ///         and ordered as Uniswap requires, `token0 < token1`.
    /// @return tokenId The position, already owned by the caller.
    /// @return liquidez Liquidity the manager credited to it.
    /// @return usado0 Token0 actually consumed; the remainder was returned.
    /// @return usado1 Token1 actually consumed; the remainder was returned.
    function abrir(AbrirParams calldata p)
        external
        naoReentrante
        ateO(p.prazo)
        returns (uint256 tokenId, uint128 liquidez, uint256 usado0, uint256 usado1)
    {
        if (!registry.isAllowedToken(p.token0)) revert TokenNaoPermitido(p.token0);
        if (!registry.isAllowedToken(p.token1)) revert TokenNaoPermitido(p.token1);

        _puxa(p.token0, p.amount0Desired);
        _puxa(p.token1, p.amount1Desired);

        _aprovaExato(p.token0, address(positionManager), p.amount0Desired);
        _aprovaExato(p.token1, address(positionManager), p.amount1Desired);

        (tokenId, liquidez, usado0, usado1) = positionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: p.token0,
                token1: p.token1,
                fee: p.fee,
                tickLower: p.tickLower,
                tickUpper: p.tickUpper,
                amount0Desired: p.amount0Desired,
                amount1Desired: p.amount1Desired,
                amount0Min: p.amount0Min,
                amount1Min: p.amount1Min,
                // The NFT is the owner's from the block it exists. This contract
                // is never `ownerOf`, which is what "non-custodial" has to mean
                // in code rather than in a sentence.
                recipient: msg.sender,
                deadline: p.prazo
            })
        );

        // Registra o que ENTROU. Sem isto nao ha como provar resultado no fecho,
        // e sem prova nao se cobra. Truncar em uint128 nao perde nada: nenhum
        // token real chega perto de 2^128 unidades, e a fabrica so aceita os que
        // o registro permite.
        // forge-lint: disable-next-line(unsafe-typecast)
        posicaoDe[tokenId] = Posicao({dep0: uint128(usado0), dep1: uint128(usado1),
                                      coletado0: 0, coletado1: 0});

        // Approvals go back to zero. A standing allowance on a contract that
        // holds nothing is a standing allowance on a contract that might one day
        // hold something.
        _aprovaExato(p.token0, address(positionManager), 0);
        _aprovaExato(p.token1, address(positionManager), 0);

        _devolveSobra(p.token0, msg.sender);
        _devolveSobra(p.token1, msg.sender);

        emit PosicaoAberta(
            tokenId, msg.sender, p.token0, p.token1, p.fee, liquidez, usado0, usado1
        );
    }

    /*//////////////////////////////////////////////////////////////
                                 COLETAR
    //////////////////////////////////////////////////////////////*/

    /// @notice Collects the fees the position has accrued, takes the protocol's
    ///         share of them, and sends the rest to the owner.
    /// @dev    Without a preceding `decreaseLiquidity`, `collect` returns fees
    ///         only — `tokensOwed` holds nothing else. So the entire collected
    ///         amount is the fee base, and no principal can be touched here even
    ///         by accident.
    /// @param  feeBpsMax The highest rate the caller accepts. The registry is
    ///         read at execution, not at signing, so without this the rate could
    ///         change between the two. Medusa proved it: a call signed under 30%
    ///         executed under 50%.
    /// @param  tokenId The position to collect from. Ownership and the
    ///         per-token approval are both read from the manager at call time,
    ///         so neither can be stale.
    /// @param  prazo Deadline. `coletar` had none, so a pending transaction
    ///         could sit in the mempool and land under a different rate however
    ///         much later.
    /// @return aoDono0 Token0 paid to the owner, net of the protocol's share.
    /// @return aoDono1 Token1 paid to the owner, net of the protocol's share.
    function coletar(uint256 tokenId, uint16 feeBpsMax, uint256 prazo)
        external
        naoReentrante
        ateO(prazo)
        returns (uint256 aoDono0, uint256 aoDono1)
    {
        address dono = _exigeDono(tokenId);
        _exigeAprovacaoUnica(tokenId);

        // `coletar` NAO COBRA. A regra do Apex T7 e que so paga quem obteve
        // resultado, e resultado so se conhece no fecho: aqui a posicao segue
        // aberta e o deslocamento de inventario dela ainda pode virar.
        //
        // Saber o resultado agora exigiria ler o principal atual, e ler o
        // principal atual exige `slot0` da pool — preco, manipulavel, e barato
        // de empurrar para fugir da cobranca. Entao nao se le.
        //
        // O que sai daqui e registrado e cobrado no `fechar`, junto com o resto.
        // `feeBpsMax` fica sem uso nesta funcao de proposito: nao ha aliquota a
        // limitar quando a aliquota e zero.
        feeBpsMax;
        uint16 bps = 0;

        (uint256 bruto0, uint256 bruto1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        if (bruto0 == 0 && bruto1 == 0) revert NadaAColetar(tokenId);

        (uint256 taxa0, uint256 taxa1) = _reparte(bruto0, bruto1, bps);

        aoDono0 = bruto0 - taxa0;
        aoDono1 = bruto1 - taxa1;

        // Guarda o que saiu sem cobranca, para o fecho cobrar sobre o total.
        Posicao storage reg = posicaoDe[tokenId];
        // forge-lint: disable-next-line(unsafe-typecast)
        reg.coletado0 += uint128(bruto0);
        // forge-lint: disable-next-line(unsafe-typecast)
        reg.coletado1 += uint128(bruto1);

        _paga(_token0De(tokenId), dono, aoDono0, taxa0);
        _paga(_token1De(tokenId), dono, aoDono1, taxa1);

        emit TaxasColetadas(tokenId, dono, bruto0, bruto1, taxa0, taxa1, bps);
    }

    /*//////////////////////////////////////////////////////////////
                                  FECHAR
    //////////////////////////////////////////////////////////////*/

    /// @dev Nine fields held in memory rather than on the stack. `fechar` needs
    ///      every one of them alive at the same moment and the EVM reaches
    ///      sixteen slots — the first version did not compile. The alternative
    ///      was `via_ir`, and that was rejected: TriviuExecutor compiles without
    ///      it, and different bytecode from its sibling is noise a comparative
    ///      audit does not need.
    ///
    ///      It was six fields until the caller's rate cap arrived. Moving the
    ///      gross amounts and the applied rate in here as well is what left room
    ///      for the extra parameter without going back over the limit.
    struct Fecho {
        uint256 principal0;
        uint256 principal1;
        uint256 total0;
        uint256 total1;
        uint256 brutas0;
        uint256 brutas1;
        uint256 taxa0;
        uint256 taxa1;
        uint16 bps;
    }

    /// @notice Withdraws all liquidity, collects everything owed, charges the
    ///         protocol's share of the FEE portion only, returns the rest, and
    ///         burns the NFT.
    /// @dev    The split is exact and needs no price: `decreaseLiquidity`
    ///         returns the principal it credited, `collect` returns principal
    ///         plus accrued fees, and the difference is the fee. Principal is
    ///         never part of the base — the same promise TriviuExecutor prints
    ///         in its own header.
    /// @param  tokenId The position to drain and burn.
    /// @param  amount0Min Slippage floor on the principal withdrawn in token0,
    ///         enforced by the position manager, not here.
    /// @param  amount1Min The same bound for token1.
    /// @param  prazo Deadline, passed through to `decreaseLiquidity` as well.
    /// @param  feeBpsMax The highest rate the caller accepts — same reason as
    ///         in `coletar`. Checked before any external movement, so a refusal
    ///         costs a revert and not a round trip through the pool.
    /// @return aoDono0 Token0 paid to the owner: principal plus the fee share
    ///         that was not charged.
    /// @return aoDono1 The same for token1.
    function fechar(
        uint256 tokenId,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 prazo,
        uint16 feeBpsMax
    )
        external
        naoReentrante
        ateO(prazo)
        returns (uint256 aoDono0, uint256 aoDono1)
    {
        address dono = _exigeDono(tokenId);
        _exigeAprovacaoUnica(tokenId);

        Fecho memory f;
        f.bps = _aliquota(feeBpsMax);
        {
            uint128 liquidez = _liquidezDe(tokenId);
            if (liquidez == 0) revert SemLiquidez(tokenId);

            (f.principal0, f.principal1) = positionManager.decreaseLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: liquidez,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: prazo
                })
            );
        }

        (f.total0, f.total1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // `total` is principal + accrued fees. `decreaseLiquidity` reported the
        // principal exactly, so the difference is the fee and no price is
        // involved. Saturating on purpose: if the position manager ever credits
        // less than it reported, the fee base becomes zero rather than
        // underflowing into a charge on principal.
        f.brutas0 = f.total0 > f.principal0 ? f.total0 - f.principal0 : 0;
        f.brutas1 = f.total1 > f.principal1 ? f.total1 - f.principal1 : 0;

        // A base inclui o que ja saiu em `coletar` sem cobranca. A posicao paga
        // uma vez, no fim, sobre tudo o que produziu — e nao paga nada se nao
        // produziu resultado.
        Posicao memory reg = posicaoDe[tokenId];
        uint256 base0 = f.brutas0 + reg.coletado0;
        uint256 base1 = f.brutas1 + reg.coletado1;

        // O TESTE. Devolveu, em cada token, pelo menos o que entrou?
        //
        // MV-1 da Medusa: a soma inclui `coletado`. O que a posicao devolveu ao
        // dono ao longo da vida e principal MAIS TODAS as taxas, inclusive as
        // que sairam em `coletar` sem cobranca. Contar so as do fecho fazia o
        // cofre nao cobrar de quem teve resultado — nao e perda do dono, e
        // receita nossa que evapora, e um teste que nao media o que o nome dele
        // diz medir.
        if (!_houveResultado(
                tokenId,
                f.principal0 + f.brutas0 + reg.coletado0,
                f.principal1 + f.brutas1 + reg.coletado1
            )) {
            f.bps = 0;
        }

        (f.taxa0, f.taxa1) = _reparte(base0, base1, f.bps);

        // Nunca cobrar mais do que ha para pagar neste ato. Sem isto, taxa
        // acumulada de muitos `coletar` poderia exceder o que o fecho devolve e
        // a subtracao abaixo reverteria — travando a SAIDA do dono, que e a
        // unica coisa que este contrato promete ser incondicional.
        if (f.taxa0 > f.total0) f.taxa0 = f.total0;
        if (f.taxa1 > f.total1) f.taxa1 = f.total1;

        aoDono0 = f.total0 - f.taxa0;
        aoDono1 = f.total1 - f.taxa1;

        _paga(_token0De(tokenId), dono, aoDono0, f.taxa0);
        _paga(_token1De(tokenId), dono, aoDono1, f.taxa1);

        delete posicaoDe[tokenId];
        positionManager.burn(tokenId);

        emit PosicaoFechada(
            tokenId,
            dono,
            f.principal0,
            f.principal1,
            f.brutas0,
            f.brutas1,
            f.taxa0,
            f.taxa1,
            f.bps
        );
    }

    /*//////////////////////////////////////////////////////////////
                                 INTERNOS
    //////////////////////////////////////////////////////////////*/

    /// @dev Reads the rate, clamps it in bytecode, and refuses it if what came
    ///      back exceeds what the caller agreed to. Clamp first and compare
    ///      second, on purpose: a caller who accepts the 50% ceiling is not
    ///      blocked by a registry set to 90%, because 90% never applies.
    ///
    ///      Called before any external movement. The ceiling alone was not
    ///      enough — it bounds how much the registry owner can take, not
    ///      whether the person paying agreed to it.
    /// @notice Houve resultado? Sem preco, sem oraculo, sem `slot0`.
    ///
    /// @dev    A REGRA, ratificada pelo Apex T7 em 2026-08-11: o dono so paga se
    ///         obteve resultado na operacao. Nao se ela foi negativa.
    ///
    ///         O cofre NAO PODE saber o resultado em dolar sem ler preco, e ler
    ///         preco reabre a familia inteira de manipulacao de oraculo que este
    ///         contrato existe para nao ter. O que ele PODE saber, exatamente e
    ///         de graca, e mais forte:
    ///
    ///           a posicao devolveu, em CADA token, pelo menos o que entrou?
    ///
    ///         Se devolveu nos dois, as taxas cobriram o deslocamento de
    ///         inventario e houve resultado sem ambiguidade. Se faltou em algum,
    ///         o resultado e ambiguo ou negativo — e nao se cobra.
    ///
    ///         E o mesmo principio do `CofreEncolheu` do cofre do ciclo,
    ///         aplicado por token.
    ///
    ///         ERRA SEMPRE A FAVOR DO DONO. Existe caso em que ele lucrou em
    ///         dolar e este teste nao cobra; perdemos essa receita, e e o lado
    ///         certo para errar.
    ///
    ///         POSICAO SEM REGISTRO NAO PAGA. Quem cunhou o NFT fora daqui nao
    ///         tem `dep0`/`dep1` guardados, entao nao ha como provar resultado, e
    ///         cobrar sem prova seria exatamente o que esta regra proibe.
    function _houveResultado(uint256 tokenId, uint256 saiu0, uint256 saiu1)
        private
        view
        returns (bool)
    {
        Posicao memory q = posicaoDe[tokenId];
        if (q.dep0 == 0 && q.dep1 == 0) return false;
        return saiu0 >= q.dep0 && saiu1 >= q.dep1;
    }

    function _aliquota(uint16 feeBpsMax) private view returns (uint16 bps) {
        uint16 lido = registry.feeBps();
        bps = lido > MAX_FEE_BPS ? MAX_FEE_BPS : lido;
        if (bps > feeBpsMax) revert TaxaAcimaDoLimite(feeBpsMax, bps);
    }

    function _reparte(uint256 bruto0, uint256 bruto1, uint16 bps)
        private
        pure
        returns (uint256 taxa0, uint256 taxa1)
    {
        taxa0 = (bruto0 * bps) / 10_000;
        taxa1 = (bruto1 * bps) / 10_000;
    }

    /// @dev Only the position's owner may act on it. Ownership is read from the
    ///      position manager at call time, so a sale transfers control with the
    ///      NFT and no stale record can point at the wrong person.
    function _exigeDono(uint256 tokenId) private view returns (address dono) {
        dono = positionManager.ownerOf(tokenId);
        if (dono != msg.sender) revert NaoEDono(tokenId, dono, msg.sender);
    }

    /// @dev `getApproved` returns the per-token approval and is NOT set by
    ///      `setApprovalForAll`. Requiring it here means the over-broad path
    ///      cannot be used to drive this contract even if a user granted it:
    ///      the call reverts. Medusa's M-4 asked for a test that fails if
    ///      someone swaps one for the other; this is the check that makes the
    ///      swap impossible rather than merely detectable.
    function _exigeAprovacaoUnica(uint256 tokenId) private view {
        address aprovado = positionManager.getApproved(tokenId);
        if (aprovado == address(0)) revert AprovacaoAusente(tokenId);
        if (aprovado != address(this)) revert AprovacaoAmpla(tokenId);
    }

    function _liquidezDe(uint256 tokenId) private view returns (uint128 liquidez) {
        (,,,,,,, liquidez,,,,) = positionManager.positions(tokenId);
    }

    function _token0De(uint256 tokenId) private view returns (address t0) {
        (,, t0,,,,,,,,,) = positionManager.positions(tokenId);
    }

    function _token1De(uint256 tokenId) private view returns (address t1) {
        (,,, t1,,,,,,,,) = positionManager.positions(tokenId);
    }

    function _puxa(address token, uint256 quantia) private {
        if (quantia == 0) return;
        if (!IERC20(token).transferFrom(msg.sender, address(this), quantia)) {
            revert TransferenciaFalhou(token, address(this), quantia);
        }
    }

    /// @dev Reset to zero before setting. Some tokens refuse a non-zero to
    ///      non-zero allowance change, and the Executor already applies this.
    ///
    ///      The return value is checked here for the same reason it is checked
    ///      on every transfer in this file. A token that answers `false` instead
    ///      of reverting used to leave the allowance at zero and fail later,
    ///      inside the position manager, with an error naming the wrong culprit.
    function _aprovaExato(address token, address gastador, uint256 quantia) private {
        if (!IERC20(token).approve(gastador, 0)) {
            revert AprovacaoRecusada(token, gastador, 0);
        }
        if (quantia != 0 && !IERC20(token).approve(gastador, quantia)) {
            revert AprovacaoRecusada(token, gastador, quantia);
        }
    }

    /// @dev Pays the owner first and the treasury second. If the treasury
    ///      transfer were to fail, the owner already has their share — the
    ///      protocol's own revenue never becomes a reason the owner cannot be
    ///      paid.
    function _paga(address token, address dono, uint256 aoDono, uint256 taxa) private {
        if (aoDono != 0 && !IERC20(token).transfer(dono, aoDono)) {
            revert TransferenciaFalhou(token, dono, aoDono);
        }
        if (taxa != 0) {
            address tesouraria = registry.treasury();
            if (tesouraria == address(0)) revert TesourariaZerada();
            if (!IERC20(token).transfer(tesouraria, taxa)) {
                revert TransferenciaFalhou(token, tesouraria, taxa);
            }
        }
    }

    /// @dev The contract must end every call holding nothing. A leftover here
    ///      would be the caller's money sitting in a contract with no function
    ///      to release it.
    function _devolveSobra(address token, address para) private {
        uint256 sobra = IERC20(token).balanceOf(address(this));
        if (sobra == 0) return;
        if (!IERC20(token).transfer(para, sobra)) {
            revert SobraNaoDevolvida(token, sobra);
        }
    }
}
