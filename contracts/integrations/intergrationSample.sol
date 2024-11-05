// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../interfaces/IIntegration.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract IntegrationSample is IIntegration, Ownable {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC4626;

    uint256 public rewardRatePerSecond;
    uint256 public lastRewardTime;
    uint256 public accumulatedRewardPerShare;
    uint256 public rewardBalance; // Track reward token balance to distribute

    mapping(address => uint256) public userRewardDebt;

    address[] public rewardTokens;
    IERC4626 public vault;
    IERC20 public rewardToken;
    address public poolMerchant;
    address public dlcBTC;

    event RewardsUpdated(
        uint256 timeElapsed,
        uint256 rewardsAdded,
        uint256 newAccumulatedRewardPerShare
    );

    event RewardsClaimed(address user, uint256 amount);
    constructor(
        IERC4626 _vault,
        IERC20 _rewardToken,
        uint256 _rewardRatePerSecond,
        address _poolMerchant,
        address _dlcBTC
    ) {
        vault = _vault;
        rewardToken = _rewardToken;
        rewardRatePerSecond = _rewardRatePerSecond;
        lastRewardTime = block.timestamp;
        rewardTokens.push(address(_rewardToken));
        poolMerchant = _poolMerchant;
        transferOwnership(_poolMerchant);
        dlcBTC = _dlcBTC;
    }

    function deposit(
        uint256 amount
    ) external override onlyOwner returns (uint256 shares) {
        require(amount > 0, "Amount must be greater than 0");
        _updateRewards();
        IERC20 _dlcBTC = IERC20(dlcBTC);

        require(
            _dlcBTC.allowance(msg.sender, address(this)) >= amount,
            "Not enough allowance"
        );
        require(_dlcBTC == IERC20(vault.asset()), "Invalid asset");

        _dlcBTC.safeTransferFrom(msg.sender, address(this), amount);
        _dlcBTC.safeApprove(address(vault), 0); // Clear any existing approval
        _dlcBTC.safeApprove(address(vault), amount);

        shares = vault.deposit(amount, address(this));
        return shares;
    }

    function withdraw(
        uint256 shares
    ) external override onlyOwner returns (uint256 assets) {
        _updateRewards();
        require(shares > 0, "Shares must be greater than 0");
        require(
            IERC20(address(vault)).balanceOf(address(this)) >= shares,
            "Not enough shares"
        );

        // Just do the approval step
        IERC20(address(vault)).safeApprove(address(vault), 0);
        IERC20(address(vault)).safeApprove(address(vault), shares);

        assets = vault.redeem(
            shares,
            address(this), // receive assets here
            address(this) // owner of shares
        );

        IERC20(vault.asset()).safeTransfer(poolMerchant, assets);

        return assets;
    }

    function updateRewardRate(uint256 newRate) external onlyOwner {
        _updateRewards(); // Update with old rate first
        rewardRatePerSecond = newRate;
    }

    // NOTE: normally, such logic would be in the vault side of the flow,
    // and we would just call it from here.
    // But for this demo, we are keeping it here.
    function claimRewards()
        external
        override
        onlyOwner
        returns (uint256[] memory amounts)
    {
        _updateRewards();

        uint256 totalShares = vault.balanceOf(address(this));
        require(totalShares > 0, "No shares");

        uint256 pending = (totalShares * accumulatedRewardPerShare) /
            1e18 -
            userRewardDebt[msg.sender];

        if (pending > 0) {
            require(
                rewardToken.balanceOf(address(this)) >= pending,
                "Insufficient reward balance"
            );

            userRewardDebt[msg.sender] =
                (totalShares * accumulatedRewardPerShare) /
                1e18;
            rewardToken.safeTransfer(msg.sender, pending);

            emit RewardsClaimed(msg.sender, pending);
        }

        amounts = new uint256[](1);
        amounts[0] = pending;
        return amounts;
    }

    function getPendingRewards()
        external
        view
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](1);

        uint256 totalShares = vault.balanceOf(address(this));
        if (totalShares == 0) {
            amounts[0] = 0;
            return amounts;
        }

        // Calculate rewards that would be added since last update
        uint256 timeElapsed = block.timestamp - lastRewardTime;
        uint256 currentBalance = rewardToken.balanceOf(address(this));
        uint256 maxRewardsToAdd = currentBalance > rewardBalance
            ? timeElapsed * rewardRatePerSecond
            : 0;

        uint256 currentAccRewardPerShare = accumulatedRewardPerShare;
        if (maxRewardsToAdd > 0) {
            currentAccRewardPerShare += (maxRewardsToAdd * 1e18) / totalShares;
        }

        amounts[0] =
            ((totalShares * currentAccRewardPerShare) / 1e18) -
            userRewardDebt[msg.sender];
        return amounts;
    }

    function _updateRewards() internal {
        uint256 totalShares = vault.balanceOf(address(this));
        if (totalShares == 0) {
            lastRewardTime = block.timestamp;
            return;
        }

        uint256 timeElapsed = block.timestamp - lastRewardTime;
        if (timeElapsed == 0) return;

        uint256 currentBalance = rewardToken.balanceOf(address(this));

        // Only distribute rewards if we have new tokens to distribute
        if (currentBalance > rewardBalance) {
            uint256 maxRewardsToAdd = timeElapsed * rewardRatePerSecond;
            uint256 actualRewardsToAdd = currentBalance - rewardBalance;

            // Use the smaller of maxRewardsToAdd or actualRewardsToAdd
            uint256 rewardsToAdd = maxRewardsToAdd < actualRewardsToAdd
                ? maxRewardsToAdd
                : actualRewardsToAdd;

            accumulatedRewardPerShare += (rewardsToAdd * 1e18) / totalShares;
            rewardBalance = currentBalance;

            emit RewardsUpdated(
                timeElapsed,
                rewardsToAdd,
                accumulatedRewardPerShare
            );
        }

        lastRewardTime = block.timestamp;
    }

    function getRewardState()
        external
        view
        returns (
            uint256 totalShares,
            uint256 currentRewardBalance,
            uint256 trackedRewardBalance,
            uint256 accRewardPerShare,
            uint256 lastUpdate,
            uint256 rewardRate
        )
    {
        return (
            vault.balanceOf(address(this)),
            rewardToken.balanceOf(address(this)),
            rewardBalance,
            accumulatedRewardPerShare,
            lastRewardTime,
            rewardRatePerSecond
        );
    }

    function getRewardTokens()
        external
        view
        override
        returns (address[] memory)
    {
        return rewardTokens;
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
