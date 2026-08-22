// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IVaultViews} from "../../src/api/IVaultViews.sol";
import {IGuard} from "../../src/api/IGuard.sol";
import {IStrategy} from "../../src/api/IStrategy.sol";
import {VaultView} from "../../src/api/types/VaultView.sol";
import {Intent, Side} from "../../src/api/types/Intent.sol";
import {Lot} from "../../src/api/types/Lot.sol";

/// @notice Example strategy: sells the candidate lot while it has balance, otherwise buys a ticket.
/// @notice Both legs declare a floor. The sell declares the allocated capital; the buy declares
///         `MIN_OUT_PER_TICKET`, scaled down when the balance covers less than a whole ticket.
/// @dev The buy floor is the only one the owner controls. `Limits.minRatioBps` compares the
///      *declared* `minOut` and never the realised amount, and `operatorMinOut` is declared by
///      whoever submits the execution. Declaring zero here would leave all three floors at zero
///      and the vault accepting a route that returns nothing — which is why the constructor
///      refuses it rather than treating it as a default.
contract ExampleStrategy is IStrategy {
    /// @notice The buy floor is zero, which would leave the vault accepting any fill.
    error MinOutPerTicketIsZero();

    /// @notice The ticket is zero, which would make the buy floor undivisible.
    error TicketIsZero();

    address public immutable ASSET;

    address public immutable BASE;

    uint256 public immutable TICKET;

    /// @notice Minimum output accepted for a whole ticket, in `ASSET` units.
    uint256 public immutable MIN_OUT_PER_TICKET;

    /// @param asset The asset the strategy buys.
    /// @param base The base currency it buys with.
    /// @param ticket The size of each buy. Reverts on zero.
    /// @param minOutPerTicket Minimum output accepted for a whole ticket. Reverts on zero.
    constructor(address asset, address base, uint256 ticket, uint256 minOutPerTicket) {
        if (ticket == 0) revert TicketIsZero();
        if (minOutPerTicket == 0) revert MinOutPerTicketIsZero();

        ASSET = asset;
        BASE = base;
        TICKET = ticket;
        MIN_OUT_PER_TICKET = minOutPerTicket;
    }

    /// @param v The vault snapshot assembled by the `Operator`.
    /// @return The proposed order: sell of the candidate lot, or buy of one ticket.
    function propose(VaultView calldata v) external view returns (Intent memory) {
        IVaultViews vault = IVaultViews(v.vault);

        if (v.candidateLotId < vault.lotCount()) {
            Lot memory candidate = vault.lot(v.candidateLotId);

            if (candidate.remaining > 0) {
                return Intent({
                    side: Side.Sell,
                    asset: candidate.asset,
                    base: candidate.base,
                    amountIn: candidate.remaining,
                    minOut: candidate.allocatedCapital,
                    lotId: v.candidateLotId
                });
            }
        }

        uint256 amountIn = v.baseBalance < TICKET ? v.baseBalance : TICKET;

        // Proportional: a partial ticket buys proportionally less, and demands proportionally less.
        // `mulDiv` and not `*` then `/` — the product of two owner-chosen numbers can overflow.
        //
        // Rounded UP, and that is the whole point. Rounding down lets the floor reach exactly zero
        // whenever `MIN_OUT_PER_TICKET * amountIn < TICKET` — with a floor of 1, on every partial
        // buy. The constructor refusing zero would then be a check that can be satisfied without
        // protecting, which teaches the workaround to whoever misread the asset's unit. Demanding
        // slightly more than proportional is the error a floor should make.
        uint256 minOut = Math.mulDiv(MIN_OUT_PER_TICKET, amountIn, TICKET, Math.Rounding.Ceil);

        return Intent({side: Side.Buy, asset: ASSET, base: BASE, amountIn: amountIn, minOut: minOut, lotId: 0});
    }
}

/// @notice Example guard: only lets you sell what the lot has as backing.
contract ExampleFullBackingGuard is IGuard {
    /// @notice The lot has no backing for the proposed sell.
    /// @param lotId The lot.
    /// @param required How much the order wants to sell.
    /// @param available The available backing.
    error LotUnderBacked(uint256 lotId, uint256 required, uint256 available);

    /// @param v The vault snapshot.
    /// @param i The order under evaluation.
    function check(VaultView calldata v, Intent calldata i) external view {
        if (i.side != Side.Sell) return;

        uint256 available = IVaultViews(v.vault).backing(i.lotId);
        if (available < i.amountIn) revert LotUnderBacked(i.lotId, i.amountIn, available);
    }
}

/// @notice Example guard: requires a minimum cooldown configured on the vault.
contract ExampleMinCooldownGuard is IGuard {
    /// @notice The vault's cooldown is lower than this guard's minimum.
    /// @param required The minimum required.
    /// @param actual The one configured on the vault.
    error CooldownTooShort(uint64 required, uint64 actual);

    uint64 public immutable MIN_COOLDOWN;

    /// @param minCooldown The minimum accepted cooldown.
    constructor(uint64 minCooldown) {
        MIN_COOLDOWN = minCooldown;
    }

    /// @param v The vault snapshot.
    function check(VaultView calldata v, Intent calldata) external view {
        uint64 configured = IVaultViews(v.vault).limits().cooldown();
        if (configured < MIN_COOLDOWN) revert CooldownTooShort(MIN_COOLDOWN, configured);
    }
}
