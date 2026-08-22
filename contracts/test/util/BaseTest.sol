// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TriviuVault} from "../../src/vault/TriviuVault.sol";
import {Commitment} from "../../src/vault/libraries/Commitment.sol";
import {ExecutionParams} from "../../src/vault/types/ExecutionParams.sol";
import {Intent, Side} from "../../src/api/types/Intent.sol";
import {VaultFactory} from "../../src/protocol/VaultFactory.sol";
import {EscapeHatch} from "../../src/protocol/EscapeHatch.sol";
import {Executor} from "../../src/protocol/Executor.sol";
import {ImplementationRegistry} from "../../src/protocol/ImplementationRegistry.sol";
import {ProtocolRegistry} from "../../src/protocol/ProtocolRegistry.sol";

import {MockERC20, MockGuard, MockRouter, MockStrategy} from "./Mocks.sol";

/// @notice The genesis in memory, with a vault already configured and fundable.
/// @dev The literal slot is the same as in `VaultConfig` and `EscapeHatch`: the three copies exist
///      because neither of the other two is readable by type, and this test is what ties them together.
abstract contract BaseTest is Test {
    bytes32 internal constant OWNER_SLOT = 0x64ad1f80561b0cd1f1b2fb404d5a36956f5f50507b9d5b3a823940b55cbcb000;

    uint8 internal constant BASE_DECIMALS = 6;
    uint8 internal constant ASSET_DECIMALS = 18;
    uint16 internal constant FEE_BPS = 50;
    uint64 internal constant COOLDOWN = 1 hours;
    uint64 internal constant MAX_VALIDITY = 15 minutes;

    address internal admin = makeAddr("admin");
    address internal governance = makeAddr("governance");
    address internal treasury = makeAddr("treasury");
    address internal operator = makeAddr("operator");
    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    MockERC20 internal base;
    MockERC20 internal asset;

    ProtocolRegistry internal registry;
    ImplementationRegistry internal implRegistry;
    EscapeHatch internal hatch;
    Executor internal executor;
    TriviuVault internal implementation;
    VaultFactory internal factory;
    MockRouter internal router;

    TriviuVault internal vault;
    MockStrategy internal strategy;
    MockGuard internal guard;

    function setUp() public virtual {
        vm.warp(365 days);

        base = new MockERC20("Base", "BASE", BASE_DECIMALS);
        asset = new MockERC20("Asset", "ASSET", ASSET_DECIMALS);
        router = new MockRouter();

        hatch = new EscapeHatch();
        executor = new Executor();

        vm.startPrank(admin);
        registry = new ProtocolRegistry(admin, treasury, FEE_BPS);
        implRegistry = new ImplementationRegistry(admin);
        vm.stopPrank();

        implementation = new TriviuVault(registry, implRegistry, address(hatch));
        factory = new VaultFactory(address(implementation));

        vm.startPrank(admin);
        implRegistry.publish(address(implementation));
        registry.setBaseCurrency(address(base), true);
        registry.setExecutor(address(executor), true);
        registry.grantRole(registry.OPERATOR_ROLE(), operator);
        vm.stopPrank();

        vault = TriviuVault(factory.createVault(owner, 0));

        strategy = new MockStrategy(_buyIntent(0));
        guard = new MockGuard(false);

        vm.startPrank(owner);
        vault.setAllowedAsset(address(asset), true);
        vault.setBaseCurrency(address(base), true);
        vault.setLimits(COOLDOWN, MAX_VALIDITY, 0, 0);
        vault.setStrategy(address(strategy));
        vm.stopPrank();
    }

    // --- fixtures ---------------------------------------------------------

    function _fundBase(uint256 amount) internal {
        base.mint(owner, amount);

        vm.startPrank(owner);
        base.approve(address(vault), amount);
        vault.deposit(IERC20(address(base)), amount);
        vm.stopPrank();
    }

    function _buyIntent(uint256 amountIn) internal view returns (Intent memory) {
        return
            Intent({
                side: Side.Buy, asset: address(asset), base: address(base), amountIn: amountIn, minOut: 0, lotId: 0
            });
    }

    function _sellIntent(uint256 lotId, uint256 amountIn) internal view returns (Intent memory) {
        return Intent({
            side: Side.Sell, asset: address(asset), base: address(base), amountIn: amountIn, minOut: 0, lotId: lotId
        });
    }

    /// @notice Opens a lot through the normal path and returns the `lotId`.
    function _openLot(uint256 spend, uint256 receive_) internal returns (uint256 lotId) {
        lotId = vault.lotCount();

        _fundBase(spend + (spend * FEE_BPS) / 10_000 + 1);

        Intent memory intent = _buyIntent(spend);
        strategy.setIntent(intent);
        router.setRate((receive_ * 1e18) / spend);

        _execute(intent);

        router.setRate(1e18);
        skip(COOLDOWN);
    }

    // --- proposal and execution -------------------------------------------

    function _legs(Intent memory intent) internal view returns (IERC20 tokenIn, IERC20 tokenOut) {
        return intent.side == Side.Buy
            ? (IERC20(address(base)), IERC20(address(asset)))
            : (IERC20(address(asset)), IERC20(address(base)));
    }

    function _params(Intent memory intent) internal view returns (ExecutionParams memory p) {
        (IERC20 tokenIn, IERC20 tokenOut) = _legs(intent);

        p = ExecutionParams({
            executor: address(executor),
            target: address(router),
            spender: address(router),
            base: address(base),
            operatorMinOut: 0,
            validUntil: uint64(block.timestamp + 60),
            declaredConfigEpoch: vault.configEpoch(),
            declaredRefund: 0,
            declaredGas: 0,
            declaredGasPrice: 0,
            declaredQuote: 0,
            candidateLotId: intent.lotId,
            routeCalldata: abi.encodeCall(MockRouter.swap, (tokenIn, tokenOut, intent.amountIn, address(vault))),
            executionHash: bytes32(0)
        });

        p.executionHash = _hash(p, intent);
    }

    /// @notice The commitment the vault will recompute, over the **already quantized** intent.
    function _hash(ExecutionParams memory p, Intent memory intent) internal view returns (bytes32) {
        (IERC20 tokenIn, IERC20 tokenOut) = _legs(intent);

        bytes32 proposal = Commitment.proposalHash(
            address(vault),
            vault.nonce(),
            vault.configEpoch(),
            vault.strategy(),
            address(tokenIn),
            address(tokenOut),
            intent.amountIn,
            intent.lotId
        );

        return Commitment.executionHash(
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
    }

    function _seal(ExecutionParams memory p, Intent memory intent) internal view returns (ExecutionParams memory) {
        p.executionHash = _hash(p, intent);
        return p;
    }

    function _execute(Intent memory intent) internal {
        ExecutionParams memory p = _params(intent);

        vm.prank(operator);
        vault.execute(p);
    }
}
