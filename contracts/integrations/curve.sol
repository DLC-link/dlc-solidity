// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.18;

interface IIntegration {
    function deposit(uint256 amount) external returns (uint256 shares);
    function withdraw(uint256 shares) external returns (uint256 amount);
}

contract CurveIntegration is IIntegration {
    // define all that we need to interact with Curve

    function deposit(
        uint256 amount
    ) external override returns (uint256 shares) {
        // Deposit amount into Curve

        // TODO: Implement deposit logic
        // deposit amount into Curve Pool through Deposit function

        return shares;
    }

    function withdraw(
        uint256 shares
    ) external override returns (uint256 amount) {
        // Withdraw shares from Curve

        // TODO: Implement withdraw logic
        // withdraw amount from Curve Pool and return to caller

        return amount;
    }
}
