// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Executor} from "../../../src/protocol/Executor.sol";
import {IExecutorEE} from "../../../src/protocol/interfaces/IExecutorEE.sol";

import {MockERC20, MockRouter, StickyAllowanceERC20} from "../../util/Mocks.sol";

/// @notice Target that calls the `Executor` back in the middle of the route.
contract ReentrantTarget {
    Executor private immutable EXECUTOR;

    constructor(Executor executor) {
        EXECUTOR = executor;
    }

    function attack(IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn) external {
        EXECUTOR.run(address(this), address(this), tokenIn, tokenOut, amountIn, abi.encodeCall(this.noop, ()));
    }

    function noop() external pure {}
}

/// @notice The `Executor` is the only address that touches the route, and must leave every call clean.
contract ExecutorTest is Test {
    Executor private executor;
    MockRouter private router;
    MockERC20 private tokenIn;
    MockERC20 private tokenOut;

    address private recipient = makeAddr("recipient");

    uint256 private constant AMOUNT = 1_000e6;

    function setUp() public {
        executor = new Executor();
        router = new MockRouter();
        tokenIn = new MockERC20("In", "IN", 6);
        tokenOut = new MockERC20("Out", "OUT", 18);
    }

    function fundAndRun(address to) public {
        tokenIn.mint(address(executor), AMOUNT);

        executor.run(
            address(router),
            address(router),
            IERC20(address(tokenIn)),
            IERC20(address(tokenOut)),
            AMOUNT,
            abi.encodeCall(MockRouter.swap, (IERC20(address(tokenIn)), IERC20(address(tokenOut)), AMOUNT, to))
        );
    }

    function test_theHappyPathLeavesNothingBehind() public {
        fundAndRun(recipient);

        assertEq(tokenIn.balanceOf(address(executor)), 0);
        assertEq(tokenOut.balanceOf(address(executor)), 0);
        assertEq(tokenIn.balanceOf(address(router)), AMOUNT);
        assertGt(tokenOut.balanceOf(recipient), 0);
    }

    /// @dev The allowance is zeroed at the end: a `spender` cannot keep being able to spend afterwards.
    function test_theAllowanceIsClearedAfterTheRoute() public {
        fundAndRun(recipient);

        assertEq(tokenIn.allowance(address(executor), address(router)), 0);
    }

    function test_aRouteThatLeavesInputBehindIsRefused() public {
        router.setLeaveBehind(1);

        vm.expectRevert(IExecutorEE.BalanceDeltaNonZero.selector);
        this.fundAndRun(recipient);
    }

    /// @dev The output must go to the vault, never sit idle in the `Executor`.
    function test_aRouteThatParksTheOutputInTheExecutorIsRefused() public {
        vm.expectRevert(IExecutorEE.BalanceDeltaNonZero.selector);
        this.fundAndRun(address(executor));
    }

    function test_theRouteRevertBubblesUp() public {
        router.setShouldRevert(true);

        vm.expectRevert(abi.encodeWithSelector(MockRouter.RouteFailed.selector, "mock router"));
        this.fundAndRun(recipient);
    }

    /// @dev A silent route returns zero output, and that is not an error here — the vault is the one enforcing floors.
    function test_aRouteThatDeliversNothingStillSettles() public {
        router.setSilent(true);

        fundAndRun(recipient);

        assertEq(tokenOut.balanceOf(recipient), 0);
    }

    function test_reentrancyIsRefused() public {
        ReentrantTarget attacker = new ReentrantTarget(executor);
        tokenIn.mint(address(executor), AMOUNT);

        vm.expectRevert(IExecutorEE.Reentrancy.selector);
        executor.run(
            address(attacker),
            address(router),
            IERC20(address(tokenIn)),
            IERC20(address(tokenOut)),
            AMOUNT,
            abi.encodeCall(ReentrantTarget.attack, (IERC20(address(tokenIn)), IERC20(address(tokenOut)), AMOUNT))
        );
    }

    /// @dev The `baseline` discounts the freshly received amount: without it the right count would be the wrong one.
    function test_aPreExistingBalanceIsNotConsumedByTheRoute() public {
        tokenIn.mint(address(executor), 5e6);

        fundAndRun(recipient);

        assertEq(tokenIn.balanceOf(address(executor)), 5e6);
    }

    /// @dev A token that does not let the allowance reach zero brings the call down: the `Executor` does not
    ///      leave owing permission to anyone, not even to a token that refuses to clear it.
    function test_aTokenThatKeepsTheAllowanceIsRefused() public {
        StickyAllowanceERC20 sticky = new StickyAllowanceERC20();
        sticky.mint(address(executor), AMOUNT);

        // The route consumes nothing, so the granted allowance is still standing at check time.
        router.setLeaveBehind(AMOUNT);

        vm.expectRevert(IExecutorEE.AllowanceNotCleared.selector);
        this.runSticky(sticky);
    }

    function runSticky(StickyAllowanceERC20 sticky) public {
        executor.run(
            address(router),
            address(router),
            IERC20(address(sticky)),
            IERC20(address(tokenOut)),
            AMOUNT,
            abi.encodeCall(MockRouter.swap, (IERC20(address(sticky)), IERC20(address(tokenOut)), AMOUNT, recipient))
        );
    }

    function test_runningWithoutTheInputFundsReverts() public {
        vm.expectRevert();
        executor.run(
            address(router),
            address(router),
            IERC20(address(tokenIn)),
            IERC20(address(tokenOut)),
            AMOUNT,
            abi.encodeCall(MockRouter.swap, (IERC20(address(tokenIn)), IERC20(address(tokenOut)), AMOUNT, recipient))
        );
    }
}
