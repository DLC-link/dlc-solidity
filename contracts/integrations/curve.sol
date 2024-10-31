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

// NOTE: I've altered deposit、withdraw、claim_rewards make up to date.
interface ICurveGauge {
    function deposit(
        uint256 _value,
        address _user,
        bool _claim_rewards
    ) external;

    function withdraw(
        uint256 _value,
        address _user,
        bool _claim_rewards
    ) external;

    function claim_rewards(address _addr, address _receiver) external;

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
    // NOTE: decimals changed
    function deposit(
        uint256 amount
    ) external override onlyOwner returns (uint256 shares) {
        // The dlcBTC tokens are still in the PoolMerchant, which has approved us to spend them

        // First approve the curve pool to spend the dlcBTC that we'll transferFrom
        IERC20(dlcBTC).approve(curvePoolAddress, amount);

        uint256[] memory amounts = new uint256[](2);
        amounts[uint256(uint128(dlcBTCIndex))] = amount;

        // Transfer the dlcBTC from PoolMerchant and add liquidity to the pool
        IERC20(dlcBTC).transferFrom(msg.sender, address(this), amount);
        shares = curvePool.add_liquidity(amounts, 0, address(this));

        // Approve and deposit LP tokens into gauge
        IERC20(curvePoolAddress).approve(curveGaugeAddress, shares);
        curveGauge.deposit(shares, address(this), false);
        shares = _fromPoolDecimals(shares);

        return shares;
    }

    function withdraw(
        uint256 shares
    ) external override onlyOwner returns (uint256 amount) {
        shares = _toPoolDecimals(shares);
        // Step 1: Withdraw LP tokens from gauge
        curveGauge.withdraw(shares, address(this), true); // Claim rewards during withdrawal

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
        curveGauge.claim_rewards(address(this), msg.sender);

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

    function _toPoolDecimals(uint256 amount) internal pure returns (uint256) {
        return amount * 1e10;
    }

    function _fromPoolDecimals(uint256 amount) internal pure returns (uint256) {
        return amount / 1e10;
    }
}
