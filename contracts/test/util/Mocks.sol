// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IVaultViews} from "../../src/api/IVaultViews.sol";
import {IGuard} from "../../src/api/IGuard.sol";
import {IStrategy} from "../../src/api/IStrategy.sol";
import {VaultView} from "../../src/api/types/VaultView.sol";
import {Intent, Side} from "../../src/api/types/Intent.sol";

/// @notice Test ERC20 with free decimals and minting.
contract MockERC20 is ERC20 {
    uint8 private immutable _DECIMALS;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _DECIMALS = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

/// @notice Token that charges a fee on transfer, outside the supported scope.
contract FeeOnTransferERC20 is ERC20 {
    uint256 public feeBps;

    constructor(uint256 feeBps_) ERC20("FeeOnTransfer", "FOT") {
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = (value * feeBps) / 10_000;
        super._update(from, to, value - fee);
        super._update(from, address(0), fee);
    }
}

/// @notice Token that ignores `approve(spender, 0)`, and therefore never lets the allowance reach zero.
contract StickyAllowanceERC20 is ERC20 {
    constructor() ERC20("Sticky", "STK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _approve(address owner_, address spender, uint256 value, bool emitEvent) internal override {
        if (value == 0 && allowance(owner_, spender) != 0) return;
        super._approve(owner_, spender, value, emitEvent);
    }
}

/// @notice Swap route: pulls the input from the caller and delivers the output to the recipient.
contract MockRouter {
    /// @notice How many output tokens to deliver per unit of input, in 1e18.
    uint256 public rate = 1e18;

    /// @notice Stops delivering the output, to exercise a zero `gross`.
    bool public silent;

    /// @notice Leaves input leftover in the caller, to exercise `BalanceDeltaNonZero`.
    uint256 public leaveBehind;

    bool public shouldRevert;

    error RouteFailed(string reason);

    function setRate(uint256 newRate) external {
        rate = newRate;
    }

    function setSilent(bool value) external {
        silent = value;
    }

    function setLeaveBehind(uint256 value) external {
        leaveBehind = value;
    }

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function swap(IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn, address to) external {
        if (shouldRevert) revert RouteFailed("mock router");

        uint256 pulled = amountIn - leaveBehind;
        tokenIn.transferFrom(msg.sender, address(this), pulled);

        if (silent) return;

        MockERC20(address(tokenOut)).mint(to, (amountIn * rate) / 1e18);
    }
}

/// @notice `Strategy` that returns the intent the test wrote.
contract MockStrategy is IStrategy {
    Intent private _intent;

    constructor(Intent memory intent) {
        _intent = intent;
    }

    function setIntent(Intent memory intent) external {
        _intent = intent;
    }

    function propose(VaultView calldata) external view returns (Intent memory) {
        return _intent;
    }
}

/// @notice `Strategy` that reverts.
contract RevertingStrategy is IStrategy {
    error Nope();

    function propose(VaultView calldata) external pure returns (Intent memory) {
        revert Nope();
    }
}

/// @notice `Strategy` whose return is shorter than an encoded `Intent`.
contract ShortReturnStrategy {
    function propose(VaultView calldata) external pure returns (uint256) {
        return 1;
    }
}

/// @notice `Strategy` that returns out-of-range fields, bypassing the type.
contract RawStrategy {
    bytes private _payload;

    constructor(bytes memory payload) {
        _payload = payload;
    }

    fallback() external {
        bytes memory payload = _payload;
        assembly {
            return(add(payload, 0x20), mload(payload))
        }
    }
}

/// @notice `Strategy` that burns all the gas it receives.
contract GasBurnerStrategy {
    function propose(VaultView calldata) external view returns (Intent memory) {
        uint256 i;
        while (gasleft() > 1000) {
            i++;
        }
        revert();
    }
}

/// @notice `Guard` that accepts or refuses as the test dictates.
contract MockGuard is IGuard {
    error Rejected();

    bool public rejects;

    constructor(bool rejects_) {
        rejects = rejects_;
    }

    function setRejects(bool value) external {
        rejects = value;
    }

    function check(VaultView calldata, Intent calldata) external view {
        if (rejects) revert Rejected();
    }
}

/// @notice `Guard` that only refuses an unbacked sell, like the example in `script/`.
contract BackingGuard is IGuard {
    error LotUnderBacked(uint256 lotId, uint256 required, uint256 available);

    function check(VaultView calldata v, Intent calldata i) external view {
        if (i.side != Side.Sell) return;

        uint256 available = IVaultViews(v.vault).backing(i.lotId);
        if (available < i.amountIn) revert LotUnderBacked(i.lotId, i.amountIn, available);
    }
}

/// @notice Alternative implementation, to exercise the upgrade path.
contract ImplementationV2 {
    uint16 public constant INTERFACE_VERSION = 2;

    bool public migrated;

    function migrate() external {
        migrated = true;
    }

    function interfaceVersion() external pure returns (uint16) {
        return INTERFACE_VERSION;
    }
}

/// @notice Implementation whose `migrate` reverts.
contract FailingMigrationImplementation {
    error MigrationFailed();

    function migrate() external pure {
        revert MigrationFailed();
    }
}
