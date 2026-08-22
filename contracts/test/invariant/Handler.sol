// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CommonBase} from "@forge-std/Base.sol";
import {StdCheats} from "@forge-std/StdCheats.sol";
import {StdUtils} from "@forge-std/StdUtils.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TriviuVault} from "../../src/vault/TriviuVault.sol";
import {Commitment} from "../../src/vault/libraries/Commitment.sol";
import {ExecutionParams} from "../../src/vault/types/ExecutionParams.sol";
import {Intent, Side} from "../../src/api/types/Intent.sol";
import {Lot} from "../../src/api/types/Lot.sol";
import {VaultFactory} from "../../src/protocol/VaultFactory.sol";
import {EscapeHatch} from "../../src/protocol/EscapeHatch.sol";
import {Executor} from "../../src/protocol/Executor.sol";
import {ImplementationRegistry} from "../../src/protocol/ImplementationRegistry.sol";
import {ProtocolRegistry} from "../../src/protocol/ProtocolRegistry.sol";

import {MockERC20, MockRouter, MockStrategy} from "../util/Mocks.sol";

/// @notice The whole world in one hand: the handler is owner and operator of the vault it shakes.
/// @dev No `Test` on purpose — the invariant runner calls these functions directly, and what
///      matters is that each one either really executes or gives up silently.
contract Handler is CommonBase, StdCheats, StdUtils {
    TriviuVault public vault;
    MockERC20 public base;
    MockERC20 public asset;
    MockStrategy public strategy;
    MockRouter public router;
    Executor public executor;
    ProtocolRegistry public registry;

    address public treasury = address(0xBEEF);

    uint256 public deposited;
    uint256 public withdrawn;
    uint256 public executions;

    constructor() {
        base = new MockERC20("Base", "BASE", 6);
        asset = new MockERC20("Asset", "ASSET", 18);
        router = new MockRouter();
        executor = new Executor();

        EscapeHatch hatch = new EscapeHatch();
        registry = new ProtocolRegistry(address(this), treasury, 50);
        ImplementationRegistry implRegistry = new ImplementationRegistry(address(this));

        TriviuVault implementation = new TriviuVault(registry, implRegistry, address(hatch));
        VaultFactory factory = new VaultFactory(address(implementation));

        implRegistry.publish(address(implementation));
        registry.setBaseCurrency(address(base), true);
        registry.setExecutor(address(executor), true);
        registry.grantRole(registry.OPERATOR_ROLE(), address(this));

        vault = TriviuVault(factory.createVault(address(this), 0));

        strategy = new MockStrategy(
            Intent({side: Side.Buy, asset: address(asset), base: address(base), amountIn: 0, minOut: 0, lotId: 0})
        );

        vault.setAllowedAsset(address(asset), true);
        vault.setBaseCurrency(address(base), true);
        vault.setLimits(0, 1 hours, 0, 0);
        vault.setStrategy(address(strategy));
    }

    // --- actions ---------------------------------------------------------------

    function deposit(uint256 amount) external {
        amount = bound(amount, 1e6, 1_000_000e6);

        base.mint(address(this), amount);
        base.approve(address(vault), amount);
        vault.deposit(IERC20(address(base)), amount);

        deposited += amount;
    }

    function withdrawBase(uint256 amount) external {
        uint256 balance = base.balanceOf(address(vault));
        if (balance == 0) return;

        amount = bound(amount, 1, balance);
        vault.withdraw(IERC20(address(base)), amount, address(this));

        withdrawn += amount;
    }

    function buy(uint256 amount, uint256 rate) external {
        uint256 balance = base.balanceOf(address(vault));
        if (balance < 2e4) return;

        // Leaves slack for fee and refund: a buy with no leftover is refused by design.
        amount = bound(amount, 1e4, balance - balance / 100 - 1);
        if (amount < 1e4) return;

        router.setRate(bound(rate, 1e16, 1e22));

        _run(
            Intent({side: Side.Buy, asset: address(asset), base: address(base), amountIn: amount, minOut: 0, lotId: 0})
        );
    }

    function sell(uint256 lotSeed, uint256 amount, uint256 rate) external {
        uint256 count = vault.lotCount();
        if (count == 0) return;

        uint256 lotId = bound(lotSeed, 0, count - 1);
        Lot memory lot = vault.lot(lotId);
        if (lot.remaining < 1e16) return;

        amount = bound(amount, 1e16, lot.remaining);
        router.setRate(bound(rate, 1e2, 1e8));

        _run(
            Intent({
                side: Side.Sell, asset: address(asset), base: address(base), amountIn: amount, minOut: 0, lotId: lotId
            })
        );
    }

    function warp(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1, 1 days));
    }

    function pause(bool value) external {
        registry.setPaused(value);
    }

    // --- proposal assembly -----------------------------------------------------

    function _run(Intent memory intent) private {
        (IERC20 tokenIn, IERC20 tokenOut) = intent.side == Side.Buy
            ? (IERC20(address(base)), IERC20(address(asset)))
            : (IERC20(address(asset)), IERC20(address(base)));

        ExecutionParams memory p = ExecutionParams({
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

        bytes32 proposal = Commitment.proposalHash(
            address(vault),
            vault.nonce(),
            vault.configEpoch(),
            address(strategy),
            address(tokenIn),
            address(tokenOut),
            intent.amountIn,
            intent.lotId
        );

        p.executionHash = Commitment.executionHash(
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

        strategy.setIntent(intent);

        // A refusal is a legitimate outcome: what cannot happen is the world being inconsistent after it.
        try vault.execute(p) {
            executions++;
        } catch {}
    }

    // --- reads for the invariants ---------------------------------------------

    function totalRemaining() external view returns (uint256 total) {
        uint256 count = vault.lotCount();
        for (uint256 i = 0; i < count; i++) {
            total += vault.lot(i).remaining;
        }
    }

    function totalAllocatedCapital() external view returns (uint256 total) {
        uint256 count = vault.lotCount();
        for (uint256 i = 0; i < count; i++) {
            total += vault.lot(i).allocatedCapital;
        }
    }
}
