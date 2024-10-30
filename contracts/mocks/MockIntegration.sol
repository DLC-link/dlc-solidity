// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IIntegration.sol";

contract MockIntegration is IIntegration {
    address[] public rewardTokens;
    mapping(address => uint256) public pendingRewards;

    constructor(address[] memory _rewardTokens) {
        rewardTokens = _rewardTokens;
    }

    function deposit(uint256 amount) external override returns (uint256) {
        return amount;
    }

    function withdraw(uint256 shares) external override returns (uint256) {
        return shares;
    }

    function claimRewards()
        external
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](rewardTokens.length);
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            amounts[i] = pendingRewards[rewardTokens[i]];
            pendingRewards[rewardTokens[i]] = 0;

            // Transfer rewards to caller
            IERC20(rewardTokens[i]).transfer(msg.sender, amounts[i]);
        }
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
        amounts = new uint256[](rewardTokens.length);
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            amounts[i] = pendingRewards[rewardTokens[i]];
        }
    }

    // Test helper function
    function mockRewards(uint256[] memory amounts) external {
        require(
            amounts.length == rewardTokens.length,
            "Invalid amounts length"
        );
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            pendingRewards[rewardTokens[i]] = amounts[i];
        }
    }
}
