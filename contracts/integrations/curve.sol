// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IIntegration.sol";

interface ICurvePool {
    function add_liquidity(
        uint256[] memory _amounts,
        uint256 _min_mint_amount,
        address _receiver
    ) external returns (uint256);

    function remove_liquidity_one_coin(
        uint256 _burn_amount,
        int128 i,
        uint256 _min_received,
        address _receiver
    ) external returns (uint256);

    function coins(uint256 i) external view returns (address);
}

// NOTE: https://curve.readthedocs.io/dao-gauges.html#liquiditygaugev3
// @Rayerleier: I am not fully sure all of these will work. Let's try and test tomorrow.
interface ICurveGauge {
    function deposit(uint256 _value, address _user) external;
    function withdraw(uint256 _value, bool _claim_rewards) external;
    function claim_rewards(address _addr) external;
    function reward_tokens(uint256 i) external view returns (address);
    function reward_count() external view returns (uint256);
    function claimable_reward(
        address _user,
        address _reward_token
    ) external view returns (uint256);
}

contract CurveIntegration is IIntegration, Ownable {
    address public curvePoolAddress;
    address public curveGaugeAddress;
    ICurvePool public curvePool;
    ICurveGauge public curveGauge;
    address public dlcBTC;
    int128 public dlcBTCIndex;

    constructor(
        address _curvePoolAddress,
        address _curveGaugeAddress,
        address _poolMerchant,
        address _dlcBTC
    ) Ownable() {
        curvePoolAddress = _curvePoolAddress;
        curveGaugeAddress = _curveGaugeAddress;
        curvePool = ICurvePool(curvePoolAddress);
        curveGauge = ICurveGauge(curveGaugeAddress);
        dlcBTC = _dlcBTC;

        // Find dlcBTC index in pool
        if (curvePool.coins(0) == dlcBTC) {
            dlcBTCIndex = 0;
        } else if (curvePool.coins(1) == dlcBTC) {
            dlcBTCIndex = 1;
        } else {
            revert("dlcBTC not found in pool");
        }

        transferOwnership(_poolMerchant);
    }

    // NOTE: we might have to change how shares/amounts translate...
    // since dlcBTC is 8 decimals and the curve pool is 18 decimals
    function deposit(
        uint256 amount
    ) external override onlyOwner returns (uint256 shares) {
        uint256[] memory amounts = new uint256[](2);
        amounts[uint256(uint128(dlcBTCIndex))] = amount;

        uint256 minMintAmount = 0; // Set the acceptable minimum for LP tokens

        // Step 1: Add liquidity to the Curve pool
        shares = curvePool.add_liquidity(amounts, minMintAmount, msg.sender);

        // Step 2: Approve the Gauge to spend LP tokens
        IERC20(curvePoolAddress).approve(curveGaugeAddress, shares);

        // Step 3: Deposit LP tokens into Curve Gauge for rewards
        curveGauge.deposit(shares, msg.sender);

        return shares;
    }

    function withdraw(
        uint256 shares
    ) external override onlyOwner returns (uint256 amount) {
        // Step 1: Withdraw LP tokens from gauge
        curveGauge.withdraw(shares, true); // Claim rewards during withdrawal

        // Step 2: Remove liquidity for dlcBTC
        amount = curvePool.remove_liquidity_one_coin(
            shares,
            dlcBTCIndex,
            0,
            msg.sender
        );

        return amount;
    }

    function claimRewards()
        external
        override
        onlyOwner
        returns (uint256[] memory amounts)
    {
        curveGauge.claim_rewards(address(this));

        uint256 rewardCount = curveGauge.reward_count();
        amounts = new uint256[](rewardCount);

        for (uint256 i = 0; i < rewardCount; i++) {
            address rewardToken = curveGauge.reward_tokens(i);
            amounts[i] = IERC20(rewardToken).balanceOf(address(this));
            if (amounts[i] > 0) {
                IERC20(rewardToken).transfer(msg.sender, amounts[i]);
            }
        }
    }

    function getRewardTokens()
        external
        view
        override
        returns (address[] memory tokens)
    {
        uint256 rewardCount = curveGauge.reward_count();
        tokens = new address[](rewardCount);

        for (uint256 i = 0; i < rewardCount; i++) {
            tokens[i] = curveGauge.reward_tokens(i);
        }
    }

    function getPendingRewards()
        external
        view
        override
        returns (uint256[] memory amounts)
    {
        uint256 rewardCount = curveGauge.reward_count();
        amounts = new uint256[](rewardCount);

        for (uint256 i = 0; i < rewardCount; i++) {
            address rewardToken = curveGauge.reward_tokens(i);
            amounts[i] = curveGauge.claimable_reward(
                address(this),
                rewardToken
            );
        }
    }
}
