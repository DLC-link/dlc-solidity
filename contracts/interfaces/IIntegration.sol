// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;
interface IIntegration {
    function deposit(uint256 amount) external returns (uint256 shares);
    function withdraw(uint256 shares) external returns (uint256 amount);
    function claimRewards() external returns (uint256[] memory amounts);
    function getRewardTokens() external view returns (address[] memory);
    function getPendingRewards() external view returns (uint256[] memory);
}
