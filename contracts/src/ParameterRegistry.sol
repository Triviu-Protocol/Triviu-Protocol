// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title  ParameterRegistry
/// @author Triviu Contributors
/// @notice On-chain mirror of protocol parameters: token and target
///         whitelists, slippage caps and default minProfit. Every change here
///         MUST originate from a public pull request — and the event records
///         the PR URL, creating the forum → Git → block audit trail.
/// @dev    v0, NOT AUDITED. `owner` starts as the deployer and will be
///         transferred to a timelocked multisig before any mainnet
///         (litepaper §4.2).
contract ParameterRegistry {
    address public owner;

    mapping(address => bool) public isAllowedToken;
    mapping(address => bool) public isAllowedTarget;

    /// @notice Slippage cap in basis points (1% = 100 bps).
    uint16 public maxSlippageBps;

    /// @notice Suggested default minProfit (reference-asset units).
    uint256 public defaultMinProfit;

    /// @notice Success-fee rate in basis points, applied to a cycle's PROFIT
    ///         (never the principal). Configurable via PR, but the Executor
    ///         enforces its own hardcoded ceiling regardless of this value.
    uint16 public feeBps;

    /// @notice Destination for the success fee. address(0) disables the fee.
    address public treasury;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenAllowed(address indexed token, bool allowed, string prUrl);
    event TargetAllowed(address indexed target, bool allowed, string prUrl);
    event MaxSlippageSet(uint16 bps, string prUrl);
    event DefaultMinProfitSet(uint256 value, string prUrl);
    event FeeBpsSet(uint16 bps, string prUrl);
    event TreasurySet(address indexed treasury, string prUrl);

    error NotOwner();
    error EmptyPrUrl();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev Every parameter change requires the URL of its originating PR.
    ///      A parameter without a public PR does not exist — by construction.
    modifier withPr(string calldata prUrl) {
        if (bytes(prUrl).length == 0) revert EmptyPrUrl();
        _;
    }

    constructor(uint16 _maxSlippageBps, uint256 _defaultMinProfit) {
        owner = msg.sender;
        maxSlippageBps = _maxSlippageBps;
        defaultMinProfit = _defaultMinProfit;
    }

    function transferOwner(address newOwner) external onlyOwner {
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setToken(address token, bool allowed, string calldata prUrl)
        external
        onlyOwner
        withPr(prUrl)
    {
        isAllowedToken[token] = allowed;
        emit TokenAllowed(token, allowed, prUrl);
    }

    function setTarget(address target, bool allowed, string calldata prUrl)
        external
        onlyOwner
        withPr(prUrl)
    {
        isAllowedTarget[target] = allowed;
        emit TargetAllowed(target, allowed, prUrl);
    }

    function setMaxSlippage(uint16 bps, string calldata prUrl)
        external
        onlyOwner
        withPr(prUrl)
    {
        maxSlippageBps = bps;
        emit MaxSlippageSet(bps, prUrl);
    }

    function setDefaultMinProfit(uint256 value, string calldata prUrl)
        external
        onlyOwner
        withPr(prUrl)
    {
        defaultMinProfit = value;
        emit DefaultMinProfitSet(value, prUrl);
    }

    /// @notice Sets the success-fee rate (bps of profit). The Executor caps the
    ///         effective fee at its own MAX_FEE_BPS, so a value above the cap
    ///         cannot over-charge users — it is simply clamped on use.
    function setFeeBps(uint16 bps, string calldata prUrl)
        external
        onlyOwner
        withPr(prUrl)
    {
        feeBps = bps;
        emit FeeBpsSet(bps, prUrl);
    }

    /// @notice Sets the treasury that receives the success fee. address(0)
    ///         disables the fee entirely (the whole result returns to the caller).
    function setTreasury(address newTreasury, string calldata prUrl)
        external
        onlyOwner
        withPr(prUrl)
    {
        treasury = newTreasury;
        emit TreasurySet(newTreasury, prUrl);
    }
}
