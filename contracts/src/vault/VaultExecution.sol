// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IVaultExecutionEE} from "../api/IVaultExecutionEE.sol";
import {IGuard} from "../api/IGuard.sol";
import {IStrategy} from "../api/IStrategy.sol";
import {VaultView} from "../api/types/VaultView.sol";
import {Intent, Side} from "../api/types/Intent.sol";
import {Limits} from "../api/types/Limits.sol";
import {IExecutor} from "../protocol/interfaces/IExecutor.sol";
import {IProtocolRegistry} from "../protocol/interfaces/IProtocolRegistry.sol";
import {ExecConfig} from "../protocol/types/ExecConfig.sol";

import {IVaultConfigEE} from "./interfaces/IVaultConfigEE.sol";
import {IVaultExecutionEvents} from "./interfaces/IVaultExecutionEvents.sol";
import {Commitment} from "./libraries/Commitment.sol";
import {Fees} from "./libraries/Fees.sol";
import {Floors} from "./libraries/Floors.sol";
import {PluginCall} from "./libraries/PluginCall.sol";
import {Quantize} from "./libraries/Quantize.sol";
import {ExecutedParams} from "./types/ExecutedParams.sol";
import {ExecutionParams} from "./types/ExecutionParams.sol";

/// @title VaultExecution
/// @notice Verification and settlement order of a vault execution.
abstract contract VaultExecution is IVaultExecutionEE, IVaultExecutionEvents {
    using SafeERC20 for IERC20;

    /// @dev Size of the six static fields of an `Intent`, in bytes.
    uint256 private constant INTENT_ENCODED_SIZE = 192;

    /// @custom:storage-location erc7201:triviu.storage.VaultExecution
    struct VaultExecutionStorage {
        uint64 nonce;
        uint64 lastExecAt;
    }

    /// @dev ERC-7201 slot of the `triviu.storage.VaultExecution` namespace.
    bytes32 private constant VAULT_EXECUTION_STORAGE =
        0xec277b84212130328e00bbffb4446588f9c2da4854b12b91ca026978afe8af00;

    function _executionStorage() private pure returns (VaultExecutionStorage storage $) {
        assembly ("memory-safe") {
            $.slot := VAULT_EXECUTION_STORAGE
        }
    }

    /// @notice Returns the vault's execution nonce.
    /// @return Current nonce.
    function _nonce() internal view returns (uint64) {
        return _executionStorage().nonce;
    }

    /// @notice Returns the timestamp of the last execution.
    /// @return Timestamp, or zero if the vault has never executed.
    function _lastExecAt() internal view returns (uint64) {
        return _executionStorage().lastExecAt;
    }

    /// @notice Executes a trade proposed by the vault's strategy.
    function _execute(ExecutionParams calldata p) internal {
        (ExecConfig cfg, uint8 baseDecimals) = _checksA({p: p, callerMustBeOperator: true});

        VaultView memory view_ = _buildView(p.candidateLotId, p.base);
        _checksBAndSwap(p, cfg, baseDecimals, view_, _askStrategy(view_));
    }

    /// @notice Executes a trade proposed by the owner themself.
    /// @param intent Proposed intent, with `amountIn` quantized during validation.
    /// @param p Parameters chosen by the submitter.
    /// @dev Bypasses the strategy; guards, limits, floors and commitment still apply.
    function _executeAsOwner(Intent memory intent, ExecutionParams calldata p) internal {
        (ExecConfig cfg, uint8 baseDecimals) = _checksA({p: p, callerMustBeOperator: false});

        _checksBAndSwap(p, cfg, baseDecimals, _buildView(p.candidateLotId, p.base), intent);
    }

    /// @notice Applies the checks that do not depend on the assembled route.
    /// @param candidateLotId Lot suggested for closing.
    /// @param base Base currency of the query.
    /// @return intent Approved intent, already quantized.
    function _dryRunChecks(uint256 candidateLotId, address base) internal view returns (Intent memory intent) {
        _checkCooldown();
        uint8 baseDecimals = _checkBaseEnabled(base);

        VaultView memory view_ = _buildView(candidateLotId, base);
        intent = _askStrategy(view_);
        _vetIntent(intent, base, baseDecimals);
        _runGuards(view_, intent);
    }

    /// @notice Checks performed before any call to third-party code.
    /// @param p Parameters declared by the submitter.
    /// @param callerMustBeOperator Requires the operator role; false on the owner entrypoint.
    /// @return cfg Execution configuration read from the registry.
    /// @return baseDecimals Decimals of the declared base currency.
    /// @dev The registry word is read once and reused in SETTLEMENT.
    function _checksA(ExecutionParams calldata p, bool callerMustBeOperator)
        private
        view
        returns (ExecConfig cfg, uint8 baseDecimals)
    {
        cfg = _protocolRegistry().execConfig(msg.sender);
        if (cfg.paused()) revert Paused();
        if (callerMustBeOperator && !cfg.callerIsOperator()) revert NotOperator();

        _checkValidity(p.validUntil);
        if (p.declaredConfigEpoch != _mandateConfigEpoch()) revert ConfigEpochStale();
        _checkCooldown();

        baseDecimals = _checkBaseEnabled(p.base);
    }

    /// @notice Validates the intent, runs the route and settles the operation.
    /// @param p Parameters declared by the submitter.
    /// @param cfg Execution configuration read in CHECKS-A.
    /// @param baseDecimals Decimals of the declared base currency.
    /// @param view_ Vault state handed to the plugins.
    /// @param intent Proposed intent, not yet quantized.
    /// @dev Receives a ready view and intent.
    function _checksBAndSwap(
        ExecutionParams calldata p,
        ExecConfig cfg,
        uint8 baseDecimals,
        VaultView memory view_,
        Intent memory intent
    ) private {
        _vetIntent(intent, p.base, baseDecimals);

        (IERC20 tokenIn, IERC20 tokenOut) = _legs(intent);
        bytes32 proposal = _checkCommitment(p, intent, view_.configEpoch, address(tokenIn), address(tokenOut));

        _runGuards(view_, intent);
        _checkRoute(p.executor, p.target, p.spender);

        // Only exists on a buy: it is the only direction in which the two deductions do not come out
        // of what the route will deliver. Two comparisons rather than one sum — `amountIn` comes from
        // the `Strategy`, which may return `type(uint256).max`, and summing first would panic on overflow.
        if (intent.side == Side.Buy) {
            (uint256 fee, uint256 refund) = _deductions(p, cfg, intent.amountIn, baseDecimals);

            if (view_.baseBalance < intent.amountIn) revert InsufficientBalanceForFees();
            if (view_.baseBalance - intent.amountIn < fee + refund) revert InsufficientBalanceForFees();
        }

        uint64 executedNonce = _reserve();
        uint256 gross = _swap(p, tokenIn, tokenOut, intent.amountIn);

        _settle(p, cfg, intent, baseDecimals, gross, proposal, executedNonce);
    }

    /// @notice Computes fee and refund on the traded amount.
    /// @param p Parameters declared by the submitter.
    /// @param cfg Execution configuration read in CHECKS-A.
    /// @param traded Amount traded in base currency.
    /// @param baseDecimals Decimals of the base currency.
    /// @return fee Fee owed to the treasury.
    /// @return refund Refund to pay, already capped by both ceilings.
    function _deductions(ExecutionParams calldata p, ExecConfig cfg, uint256 traded, uint8 baseDecimals)
        private
        pure
        returns (uint256 fee, uint256 refund)
    {
        fee = Fees.protocolFee(traded, cfg.feeBps());
        refund = Fees.gasRefund(p.declaredRefund, traded, baseDecimals);
    }

    /// @notice Applies the floors, records the position, pays the costs and emits the event.
    /// @param p Parameters declared by the submitter.
    /// @param cfg Execution configuration read in CHECKS-A.
    /// @param intent Approved and quantized intent.
    /// @param baseDecimals Decimals of the base currency.
    /// @param gross Amount received, measured by balance delta.
    /// @param proposal Proposal hash recomputed on-chain.
    /// @param executedNonce Nonce prior to the increment.
    /// @dev The floors measure different quantities: the submitter's on the gross, the strategy's on
    ///      the net.
    function _settle(
        ExecutionParams calldata p,
        ExecConfig cfg,
        Intent memory intent,
        uint8 baseDecimals,
        uint256 gross,
        bytes32 proposal,
        uint64 executedNonce
    ) private {
        if (gross < p.operatorMinOut) revert GrossBelowOperatorMin();

        bool isBuy = intent.side == Side.Buy;
        (uint256 fee, uint256 refund) = _deductions(p, cfg, isBuy ? intent.amountIn : gross, baseDecimals);

        uint256 net = isBuy ? gross : gross - fee - refund;

        if (net < intent.minOut) revert NetBelowStrategyMin();

        uint256 lotId;
        if (isBuy) {
            _recordBuy(intent.asset, intent.base, gross, intent.amountIn);
        } else {
            lotId = intent.lotId;
            _recordSell(lotId, intent.amountIn);
        }

        _payCosts(p, IERC20(intent.base), cfg.treasury(), fee, refund);

        emit Executed(ExecutedParams({
                proposalHash: proposal,
                nonce: executedNonce,
                side: intent.side,
                asset: intent.asset,
                base: intent.base,
                amountIn: intent.amountIn,
                gross: gross,
                fee: fee,
                refund: refund,
                net: net,
                lotId: lotId,
                target: p.target
            }));
    }

    /// @notice Pays the protocol fee and the gas refund.
    /// @param p Parameters declared by the submitter.
    /// @param base Base currency of the execution.
    /// @param treasury_ Recipient of the fee.
    /// @param fee Fee owed.
    /// @param refund Refund to pay.
    function _payCosts(ExecutionParams calldata p, IERC20 base, address treasury_, uint256 fee, uint256 refund)
        private
    {
        if (fee != 0) base.safeTransfer(treasury_, fee);

        // The log is emitted when there was a REQUEST, not when there was a payment: a refund cut to
        // zero is exactly the case the client needs to see in order to dispute it.
        if (p.declaredRefund != 0) {
            if (refund != 0) base.safeTransfer(msg.sender, refund);

            emit RefundDetail(p.declaredGas, p.declaredGasPrice, p.declaredQuote, p.declaredRefund, refund);
        }
    }

    /// @notice Builds the vault state handed to the strategy and the guards.
    /// @param candidateLotId Lot suggested for closing.
    /// @param base Declared base currency.
    /// @return Vault state in this block.
    /// @dev Built only once, so every plugin receives the same values.
    function _buildView(uint256 candidateLotId, address base) private view returns (VaultView memory) {
        return VaultView({
            vault: address(this),
            configEpoch: _mandateConfigEpoch(),
            lastExecAt: _lastExecAt(),
            candidateLotId: candidateLotId,
            baseBalance: IERC20(base).balanceOf(address(this))
        });
    }

    /// @notice Validates the proposed intent and quantizes `amountIn`.
    /// @param intent Proposed intent; `amountIn` is modified in place.
    /// @param base Declared base currency.
    /// @param baseDecimals Decimals of the base currency.
    /// @dev Shared by the three entrypoints. Base-currency curation is only required on a buy, so
    ///      that closing old lots is never blocked.
    function _vetIntent(Intent memory intent, address base, uint8 baseDecimals) private view {
        uint8 assetDecimals = _checkIntent(intent, base);

        Limits limits_ = _mandateLimits();
        intent.amountIn = Quantize.down(intent.amountIn, limits_.quantum());
        if (intent.amountIn == 0) revert AmountQuantizedToZero();

        // The floors measure in whole units, so the decimals swap sides with the leg.
        (uint8 decimalsIn, uint8 decimalsOut) =
            intent.side == Side.Buy ? (baseDecimals, assetDecimals) : (assetDecimals, baseDecimals);

        if (intent.amountIn < Floors.minTicket(decimalsIn)) revert TicketTooSmall();
        if (!Floors.meetsMinRatio(intent.amountIn, intent.minOut, decimalsIn, decimalsOut, limits_.minRatioBps())) {
            revert RatioTooLow();
        }

        if (intent.side == Side.Buy) {
            if (!_protocolRegistry().isBaseCurrency(base)) revert IVaultConfigEE.BaseNotCurated();
        } else {
            _vetCandidateLot(intent.lotId, intent.asset, base, intent.amountIn);
        }
    }

    /// @notice Enforces the minimum interval since the last execution.
    /// @dev The sum is done in `uint256`: in 64 bits a very high cooldown would overflow and disable
    ///      the check itself.
    function _checkCooldown() private view {
        // The clock is the block's, and the submitter chooses the moment of execution — which the
        // trust model already assumes.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < uint256(_lastExecAt()) + _mandateLimits().cooldown()) revert CooldownActive();
    }

    /// @notice Validates the declared deadline for the execution.
    /// @param validUntil Declared cutoff timestamp.
    /// @dev Must be in the future and fit within `maxValidity`.
    function _checkValidity(uint64 validUntil) private view {
        // forge-lint: disable-start(block-timestamp)
        if (block.timestamp > validUntil) revert ProposalExpired();
        if (uint256(validUntil) > block.timestamp + _mandateLimits().maxValidity()) revert ValidityTooLong();
        // forge-lint: disable-end(block-timestamp)
    }

    /// @notice Requires the base currency to be enabled on this vault.
    /// @param base Declared base currency.
    /// @return decimals Recorded decimals of the base currency.
    function _checkBaseEnabled(address base) private view returns (uint8 decimals) {
        decimals = _mandateBaseCurrencyDecimals(base);
        if (decimals == 0) revert IVaultConfigEE.BaseNotEnabled();
    }

    /// @notice Queries the plugged-in strategy.
    /// @param view_ Vault state handed to the plugin.
    /// @return intent Proposed intent, not yet quantized.
    function _askStrategy(VaultView memory view_) private view returns (Intent memory intent) {
        (bool ok, bytes memory returned) =
            PluginCall.staticcallCapped(_mandateStrategy(), abi.encodeCall(IStrategy.propose, (view_)));

        if (!ok || returned.length < INTENT_ENCODED_SIZE) revert StrategyCallFailed();

        (uint256 side, uint256 asset, uint256 base, uint256 amountIn, uint256 minOut, uint256 lotId) =
            abi.decode(returned, (uint256, uint256, uint256, uint256, uint256, uint256));

        if (side > uint256(type(Side).max)) revert StrategyCallFailed();
        if (asset > type(uint160).max || base > type(uint160).max) revert StrategyCallFailed();

        // The narrowings do not truncate: the line above already rejected what does not fit in 160 bits.
        // forge-lint: disable-start(unsafe-typecast)
        intent = Intent({
            side: Side(side),
            asset: address(uint160(asset)),
            base: address(uint160(base)),
            amountIn: amountIn,
            minOut: minOut,
            lotId: lotId
        });
        // forge-lint: disable-end(unsafe-typecast)
    }

    /// @notice Checks the intent's base currency and asset against the vault's lists.
    /// @param intent Proposed intent.
    /// @param base Declared base currency.
    /// @return decimals Recorded decimals of the asset.
    function _checkIntent(Intent memory intent, address base) private view returns (uint8 decimals) {
        if (intent.base != base) revert IVaultConfigEE.DeclaredBaseMismatch();

        decimals = _mandateAssetDecimals(intent.asset);
        if (decimals == 0) revert IVaultConfigEE.AssetNotAllowed();
    }

    /// @notice Derives the input and output tokens from the intent's side.
    /// @param intent Validated intent.
    /// @return tokenIn Token leaving the vault.
    /// @return tokenOut Token entering the vault.
    function _legs(Intent memory intent) private pure returns (IERC20 tokenIn, IERC20 tokenOut) {
        return intent.side == Side.Buy
            ? (IERC20(intent.base), IERC20(intent.asset))
            : (IERC20(intent.asset), IERC20(intent.base));
    }

    /// @notice Recomputes the commitment and compares it with the declared one.
    /// @param p Parameters declared by the submitter.
    /// @param intent Intent already quantized.
    /// @param configEpoch Configuration epoch used in the proposal.
    /// @param tokenIn Token leaving the vault.
    /// @param tokenOut Token entering the vault.
    /// @return proposal Proposal hash, recomputed on-chain.
    function _checkCommitment(
        ExecutionParams calldata p,
        Intent memory intent,
        uint64 configEpoch,
        address tokenIn,
        address tokenOut
    ) private view returns (bytes32 proposal) {
        proposal = Commitment.proposalHash(
            address(this), _nonce(), configEpoch, _mandateStrategy(), tokenIn, tokenOut, intent.amountIn, intent.lotId
        );

        bytes32 expected = Commitment.executionHash(
            proposal,
            p.executor,
            p.target,
            p.spender,
            intent.amountIn,
            p.operatorMinOut,
            p.validUntil,
            p.declaredRefund,
            keccak256(p.routeCalldata)
        );

        if (expected != p.executionHash) revert CommitmentMismatch();
    }

    /// @notice Queries every plugged-in guard; the first veto ends the execution.
    /// @param view_ Vault state handed to the plugins.
    /// @param intent Proposed intent, already quantized.
    /// @dev The calldata is encoded once, outside the loop.
    function _runGuards(VaultView memory view_, Intent memory intent) private view {
        address[] memory guardList = _mandateGuards();
        bytes memory data = abi.encodeCall(IGuard.check, (view_, intent));

        for (uint256 i = 0; i < guardList.length; i++) {
            (bool ok, bytes memory reason) = PluginCall.staticcallCapped(guardList[i], data);
            if (!ok) revert GuardRejected(guardList[i], reason);
        }
    }

    /// @notice Rejects an uncurated executor, and target/spender that would allow a transfer
    ///         disguised as a route.
    /// @param executor Executor declared in the execution.
    /// @param target Declared target.
    /// @param spender Declared spender.
    /// @dev The curation is read on EVERY execution, never at configuration time: an executor
    ///      removed by governance stops being accepted on the next call, with no migration.
    ///      Applies to both entrypoints — the operator's and the owner's — so the invariant is
    ///      single: the vault only ever hands its input to a curated executor.
    function _checkRoute(address executor, address target, address spender) private view {
        if (!_protocolRegistry().isExecutor(executor)) revert ExecutorNotCurated();
        if (_isForbidden(target, executor)) revert ForbiddenTarget();
        if (_isForbidden(spender, executor)) revert ForbiddenSpender();
    }

    /// @notice Tells whether an address is forbidden as target or spender.
    /// @param who Address being evaluated.
    /// @param executor Executor declared in the execution.
    /// @return `true` for an allowed asset, a base currency, the vault itself or the executor.
    /// @dev The list is derived from the decimals maps, with no extra storage.
    function _isForbidden(address who, address executor) private view returns (bool) {
        return who == address(this) || who == executor || _mandateAssetDecimals(who) != 0
            || _mandateBaseCurrencyDecimals(who) != 0;
    }

    /// @notice Increments the nonce and records the execution timestamp.
    /// @return executedNonce Nonce prior to the increment, used in the commitment.
    function _reserve() private returns (uint64 executedNonce) {
        VaultExecutionStorage storage $ = _executionStorage();

        executedNonce = $.nonce;
        unchecked {
            $.nonce = executedNonce + 1;
        }
        // forge-lint: disable-next-line(block-timestamp)
        $.lastExecAt = uint64(block.timestamp);
    }

    /// @notice Transfers the input amount to the executor and measures what was received.
    /// @param p Parameters declared by the submitter.
    /// @param tokenIn Token leaving the vault.
    /// @param tokenOut Token entering the vault.
    /// @param amountIn Input amount, already quantized.
    /// @return Amount received, measured by balance delta.
    /// @dev The vault transfers and never grants an allowance.
    function _swap(ExecutionParams calldata p, IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn)
        private
        returns (uint256)
    {
        uint256 balanceBefore = tokenOut.balanceOf(address(this));

        tokenIn.safeTransfer(p.executor, amountIn);
        IExecutor(p.executor).run(p.target, p.spender, tokenIn, tokenOut, amountIn, p.routeCalldata);

        return tokenOut.balanceOf(address(this)) - balanceBefore;
    }

    function _vetCandidateLot(uint256 lotId, address asset, address base, uint256 amount) internal view virtual;

    function _recordBuy(address asset, address base, uint256 received, uint256 spent) internal virtual;

    function _recordSell(uint256 lotId, uint256 sold) internal virtual;

    function _mandateStrategy() internal view virtual returns (address);

    function _mandateGuards() internal view virtual returns (address[] memory);

    function _mandateLimits() internal view virtual returns (Limits);

    function _mandateConfigEpoch() internal view virtual returns (uint64);

    function _mandateAssetDecimals(address asset) internal view virtual returns (uint8);

    function _mandateBaseCurrencyDecimals(address base) internal view virtual returns (uint8);

    function _protocolRegistry() internal view virtual returns (IProtocolRegistry);
}
