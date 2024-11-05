// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../interfaces/IIntegration.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract IntegrationSample is IIntegration, Ownable {
    uint256 public rewardRatePerSecond;
    uint256 public lastRewardTime;
    uint256 public pendingRewards;

    address[] public rewardTokens;
    IERC4626 public vault;
    IERC20 public rewardToken;

    constructor(
        IERC4626 _vault,
        IERC20 _rewardToken,
        uint256 _rewardRatePerSecond,
        address _poolMerchant
    ) {
        vault = _vault;
        rewardToken = _rewardToken;
        rewardRatePerSecond = _rewardRatePerSecond;
        lastRewardTime = block.timestamp;
        rewardTokens.push(address(_rewardToken));
        transferOwnership(_poolMerchant);
    }

    // NOTE: need to use transferFrom
    function deposit(
        uint256 amount
    ) external override onlyOwner returns (uint256 shares) {
        require(amount > 0, "Amount must be greater than 0");
        _updateRewards();
        IERC20 asset = IERC20(vault.asset());
        asset.approve(address(vault), amount);
        shares = vault.deposit(amount, address(this));
        return shares;
    }

    function withdraw(
        uint256 shares
    ) external override onlyOwner returns (uint256 assets) {
        require(shares > 0, "Shares must be greater than 0");

        // Update rewards
        _updateRewards();

        // Check if we have enough shares
        uint256 availableShares = vault.balanceOf(address(this));
        require(availableShares >= shares, "Not enough shares");

        // First redeem shares from vault to get assets
        assets = vault.redeem(shares, msg.sender, address(this));

        return assets;
    }

    function claimRewards()
        external
        override
        onlyOwner
        returns (uint256[] memory amounts)
    {
        _updateRewards();
        uint256 pendingReward = pendingRewards;
        require(pendingReward > 0, "No rewards to claim");
        pendingRewards = 0;

        amounts = new uint256[](rewardTokens.length);
        amounts[0] = pendingReward;
        rewardToken.transfer(msg.sender, pendingReward);
    }

    function getRewardTokens()
        external
        view
        override
        returns (address[] memory)
    {
        return rewardTokens;
    }

    function getPendingRewards()
        external
        view
        override
        returns (uint256[] memory amounts)
    {
        uint256 rewards = _calculateRewards();
        amounts = new uint256[](rewardTokens.length);
        amounts[0] = pendingRewards + rewards;
    }

    function _updateRewards() internal {
        uint256 rewards = _calculateRewards();
        pendingRewards += rewards;
        lastRewardTime = block.timestamp;
    }

    function _calculateRewards() internal view returns (uint256) {
        uint256 timeElapsed = block.timestamp - lastRewardTime;
        uint256 userShares = vault.balanceOf(address(this));
        uint256 totalShares = vault.totalSupply();
        if (totalShares == 0) {
            return 0;
        }
        return (timeElapsed * rewardRatePerSecond * userShares) / totalShares;
    }
}
