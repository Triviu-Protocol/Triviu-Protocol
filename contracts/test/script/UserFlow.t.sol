// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Config, Deploy, Deployment} from "../../script/01_Deploy.s.sol";
import {UserConfig, UserFlow} from "../../script/user/UserFlow.s.sol";
import {DepositLib} from "../../script/user/actions/08_Deposit.s.sol";
import {SetStrategyLib} from "../../script/user/actions/04_SetStrategy.s.sol";
import {WithdrawLib} from "../../script/user/actions/09_Withdraw.s.sol";
import {Deployments} from "../../script/util/Deployments.sol";
import {ExampleStrategy} from "../../script/user/ExamplePlugins.sol";
import {TriviuVault} from "../../src/vault/TriviuVault.sol";
import {IVaultConfigEE} from "../../src/vault/interfaces/IVaultConfigEE.sol";
import {Intent, Side} from "../../src/api/types/Intent.sol";
import {VaultView} from "../../src/api/types/VaultView.sol";

import {MockERC20} from "../util/Mocks.sol";

/// @notice The client onboarding running offline, against a genesis deployed in memory.
/// @dev Inherits `UserFlow` so the calls to the vault come out of this contract, as they come out of the
///      script contract in production. The on-disk record is the same one `01_Deploy` writes — hence
///      `records` being `public` there: here it is reused instead of rewritten.
contract UserFlowTest is Test, UserFlow {
    MockERC20 private usdc;
    MockERC20 private token;

    address private governance = makeAddr("governance");
    address private treasury = makeAddr("treasury");
    address private operator = makeAddr("operator");

    /// @dev A chain only for the tests: the on-disk record is real, and writing under the id of a real
    ///      chain would overwrite its record — the same hole the genesis `_save` closes.
    uint256 private constant TEST_CHAIN_ID = 999_999;

    uint256 private constant TICKET = 10e6;
    uint256 private constant DEPOSIT = 100e6;

    /// @dev The buy floor for a whole ticket, in `token` units (18 decimals). Any non-zero number
    ///      serves the flow tests; what matters is that the flow can no longer produce a strategy
    ///      that declares no floor at all.
    uint256 private constant MIN_OUT_PER_TICKET = 9e18;

    function setUp() public {
        vm.chainId(TEST_CHAIN_ID);

        usdc = new MockERC20("USD Coin", "USDC", 6);
        token = new MockERC20("Token", "TKN", 18);

        Deploy genesis = new Deploy();

        Config memory config = Config({
            deployer: address(genesis),
            governance: governance,
            treasury: treasury,
            operator: operator,
            baseToken: address(usdc),
            feeBps: 50
        });

        genesis.validate(config);
        Deployment memory deployment = genesis.deploy(config);

        Deployments.save(block.chainid, genesis.records(deployment, config));
    }

    function _config() private view returns (UserConfig memory) {
        return UserConfig({
            owner: address(this),
            index: 0,
            asset: address(token),
            ticket: TICKET,
            minOutPerTicket: MIN_OUT_PER_TICKET,
            strategy: address(0),
            guard: address(0),
            cooldown: 1 hours,
            maxValidity: 15 minutes,
            minRatioBps: 0,
            quantum: 0,
            depositAmount: DEPOSIT
        });
    }

    function test_theFlowLeavesTheVaultReadyToTrade() public {
        usdc.mint(address(this), DEPOSIT);

        TriviuVault vault = flow(_config());

        assertEq(vault.owner(), address(this));
        assertEq(vault.assetDecimals(address(token)), 18);
        assertEq(vault.baseCurrencyDecimals(address(usdc)), 6);
        assertNotEq(vault.strategy(), address(0));
        // With no `GUARD` declared the flow plugs none: the example guard belongs to the standalone step.
        assertEq(vault.guards().length, 0);
        assertEq(vault.limits().cooldown(), 1 hours);
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT);
    }

    /// @dev Running the flow twice neither creates a second vault nor repeats the setters.
    function test_theFlowIsIdempotent() public {
        usdc.mint(address(this), DEPOSIT * 2);

        TriviuVault first = flow(_config());
        uint64 epoch = first.configEpoch();

        TriviuVault second = flow(_config());

        assertEq(address(first), address(second));
        assertEq(second.configEpoch(), epoch);
        assertEq(usdc.balanceOf(address(second)), DEPOSIT * 2);
    }

    /// @dev The deposit ensures the allowance on its own: step 7 is no longer mandatory before it.
    function test_theDepositApprovesWhatIsMissing() public {
        usdc.mint(address(this), DEPOSIT);

        TriviuVault vault = flow(_config());

        assertEq(usdc.allowance(address(this), address(vault)), 0);
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT);
    }

    /// @dev The deposit floor is derived from the ticket: below it the vault would be born stuck.
    function test_aDepositBelowTheTicketFloorIsRefused() public {
        usdc.mint(address(this), DEPOSIT);

        UserConfig memory config = _config();
        config.depositAmount = TICKET;

        vm.expectRevert(
            abi.encodeWithSelector(DepositLib.DepositBelowTicket.selector, TICKET, TICKET + (TICKET * 50) / 10_000)
        );
        this.flow(config);
    }

    /// @dev Without an asset the flow does not even reach step 4: step 2 already refuses the zero address.
    function test_theFlowNeedsAnAsset() public {
        usdc.mint(address(this), DEPOSIT);

        UserConfig memory config = _config();
        config.asset = address(0);

        vm.expectRevert(abi.encodeWithSelector(IVaultConfigEE.NotAContract.selector, address(0)));
        this.flow(config);
    }

    /// @dev Step 4 assembles the `ExampleStrategy` when none was declared, with the owner's ticket.
    function test_theExampleStrategyIsBuiltWithTheDeclaredTicket() public {
        usdc.mint(address(this), DEPOSIT);

        TriviuVault vault = flow(_config());

        assertEq(ExampleStrategy(vault.strategy()).TICKET(), TICKET);
        assertEq(ExampleStrategy(vault.strategy()).ASSET(), address(token));
        assertEq(ExampleStrategy(vault.strategy()).BASE(), address(usdc));
        assertEq(ExampleStrategy(vault.strategy()).MIN_OUT_PER_TICKET(), MIN_OUT_PER_TICKET);
    }

    // --- the buy floor of the example strategy ---------------------------------

    /// @dev The regression guard the audit asked for. On a buy this is the only floor the owner
    ///      controls: `Limits.minRatioBps` compares the declared `minOut` and never the realised
    ///      amount, and `operatorMinOut` is declared by whoever submits. A strategy shipping zero
    ///      here leaves all three at zero and the vault accepting a route that returns nothing.
    ///      If this test starts passing with a zero argument, the guard was removed.
    function test_theExampleStrategyRefusesToShipWithoutABuyFloor() public {
        vm.expectRevert(ExampleStrategy.MinOutPerTicketIsZero.selector);
        new ExampleStrategy(address(token), address(usdc), TICKET, 0);
    }

    /// @dev A zero ticket would make the proportional floor divide by zero on every proposal.
    function test_theExampleStrategyRefusesAZeroTicket() public {
        vm.expectRevert(ExampleStrategy.TicketIsZero.selector);
        new ExampleStrategy(address(token), address(usdc), 0, MIN_OUT_PER_TICKET);
    }

    /// @dev The floor rounds **up**, so it never reaches zero while `MIN_OUT_PER_TICKET` is not.
    ///      Rounding down would let it vanish whenever `MIN_OUT_PER_TICKET * amountIn < TICKET` —
    ///      and with a floor of 1, on every partial buy up to a whole ticket minus one unit. The
    ///      constructor refusing zero would then be a check satisfiable without protecting.
    ///      The worst case is tested, not the boundary: a floor of 1 is what someone types to get
    ///      past the constructor without understanding the asset's unit.
    function test_theBuyFloorNeverRoundsAwayToZero() public {
        usdc.mint(address(this), DEPOSIT);
        TriviuVault vault = flow(_config());

        ExampleStrategy tiny = new ExampleStrategy(address(token), address(usdc), TICKET, 1);

        // The smallest legal buy: `Floors.minTicket(6)`. Rounding down gives 1 * 1e4 / 1e7 = 0.
        assertGt(tiny.propose(_view(address(vault), 1e4)).minOut, 0, "the floor rounded away to zero");

        // And a buy of a whole ticket minus one unit, which rounding down also zeroes.
        assertGt(tiny.propose(_view(address(vault), TICKET - 1)).minOut, 0, "the floor rounded away to zero");
    }

    /// @dev A whole ticket demands the whole floor; half a ticket demands half of it.
    function test_theBuyFloorFollowsTheAmountActuallySpent() public {
        usdc.mint(address(this), DEPOSIT);
        TriviuVault vault = flow(_config());

        ExampleStrategy strategy = ExampleStrategy(vault.strategy());

        Intent memory whole = strategy.propose(_view(address(vault), DEPOSIT));
        assertEq(uint8(whole.side), uint8(Side.Buy));
        assertEq(whole.amountIn, TICKET, "a full balance buys a whole ticket");
        assertEq(whole.minOut, MIN_OUT_PER_TICKET, "a whole ticket demands the whole floor");

        Intent memory half = strategy.propose(_view(address(vault), TICKET / 2));
        assertEq(half.amountIn, TICKET / 2, "a short balance buys what it has");
        assertEq(half.minOut, MIN_OUT_PER_TICKET / 2, "half a ticket demands half the floor");
    }

    function _view(address vault, uint256 baseBalance) private pure returns (VaultView memory) {
        return VaultView({vault: vault, configEpoch: 0, lastExecAt: 0, candidateLotId: 0, baseBalance: baseBalance});
    }

    function test_aTicketBelowTheCurrencyFloorIsRefused() public {
        usdc.mint(address(this), DEPOSIT);

        UserConfig memory config = _config();
        config.ticket = 1;

        vm.expectRevert(abi.encodeWithSelector(SetStrategyLib.ExampleTicketBelowFloor.selector, 1, 1e4));
        this.flow(config);
    }

    /// @dev Whoever brought their own plugins does not receive the example ones.
    function test_theDeclaredPluginsAreTheOnesPluggedIn() public {
        usdc.mint(address(this), DEPOSIT);

        address ownStrategy = makeAddr("strategy");
        address ownGuard = makeAddr("guard");
        vm.etch(ownStrategy, hex"600160005260206000f3");
        vm.etch(ownGuard, hex"600160005260206000f3");

        UserConfig memory config = _config();
        config.strategy = ownStrategy;
        config.guard = ownGuard;
        config.ticket = 0;

        TriviuVault vault = flow(config);

        assertEq(vault.strategy(), ownStrategy);
        assertEq(vault.guards()[0], ownGuard);
    }

    function test_theWithdrawalTakesEverythingWhenTheAmountIsZero() public {
        usdc.mint(address(this), DEPOSIT);
        TriviuVault vault = flow(_config());

        uint256 taken = WithdrawLib.run(vault, IERC20(address(usdc)), 0, address(this));

        assertEq(taken, DEPOSIT);
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(address(this)), DEPOSIT);
    }

    function test_theWithdrawalRefusesTheZeroTarget() public {
        usdc.mint(address(this), DEPOSIT);
        TriviuVault vault = flow(_config());

        vm.expectRevert(WithdrawLib.WithdrawToIsZero.selector);
        this.withdrawTo(vault, address(0));
    }

    function test_theWithdrawalRefusesAnEmptyVault() public {
        usdc.mint(address(this), DEPOSIT);
        TriviuVault vault = flow(_config());

        WithdrawLib.run(vault, IERC20(address(usdc)), 0, address(this));

        vm.expectRevert(abi.encodeWithSelector(WithdrawLib.NothingToWithdraw.selector, address(usdc)));
        this.withdrawTo(vault, address(this));
    }

    /// @notice External bridge: `expectRevert` needs a call, and the library is `internal`.
    function withdrawTo(TriviuVault vault, address to) external {
        WithdrawLib.run(vault, IERC20(address(usdc)), 0, to);
    }
}
