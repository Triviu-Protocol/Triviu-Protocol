// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title  GasTank
/// @author Triviu Contributors
/// @notice A PUBLIC, non-custodial gas-safety reserve. Each user funds their own
///         balance and is the ONLY account that can move it — the protocol never
///         takes these funds and earns nothing here. The reserve exists so an
///         operation's return leg does not get stuck in the block flow for want
///         of gas. Every balance and every movement is on-chain and verifiable.
/// @dev    v0: deposit/withdraw by the owner of each balance (pull-payment,
///         Checks-Effects-Interactions, reentrancy-safe). The AUTOMATED
///         consumption path — spending a user's own reserve to complete a stuck
///         return leg — is a v0.2 item pending its exact trigger mechanics; it
///         touches user funds and ships only once specified and audited. Until
///         then, this is a transparent, user-controlled gas escrow: nothing here
///         can leave except back to the account that deposited it.
contract GasTank {
    /// @notice Each account's own gas reserve, in native units (POL on Polygon).
    mapping(address => uint256) public balanceOf;

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);

    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();

    /// @notice Fund your own gas reserve.
    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Bare transfers are credited to the sender's reserve too.
    receive() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw from your OWN reserve. No one else can move it.
    /// @dev    State is updated before the external call (CEI); a reentrant call
    ///         sees the already-debited balance and cannot double-spend.
    function withdraw(uint256 amount) external {
        uint256 bal = balanceOf[msg.sender];
        if (amount > bal) revert InsufficientBalance(amount, bal);

        balanceOf[msg.sender] = bal - amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }
}
