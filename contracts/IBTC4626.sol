// SPDX-License-Identifier: MIT
//  ██ ██████  ████████  ██████
//  ██ ██   ██    ██    ██
//  ██ ██████     ██    ██
//  ██ ██   ██    ██    ██
//  ██ ██████     ██     ██████

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControlDefaultAdminRules.sol";

contract WrappedIBTC is
    ERC4626,
    ERC20Permit,
    ReentrancyGuard,
    AccessControlDefaultAdminRules
{
    using SafeERC20 for IERC20;

    error InvalidToken();

    constructor(
        IERC20 _ibtcAddress,
        address _defaultAdmin
    )
        ERC4626(_ibtcAddress)
        ERC20("Wrapped iBTC", "wiBTC")
        ERC20Permit("wiBTC")
        AccessControlDefaultAdminRules(2 days, _defaultAdmin)
    {}

    /// @dev Necessary because both ERC20 (from ERC20Permit) and ERC4626 declare decimals()
    function decimals() public pure override(ERC4626, ERC20) returns (uint8) {
        return 8;
    }

    /**
     * @notice Allows the owner to rescue tokens accidentally sent to the contract.
     * Note that the owner cannot rescue iBTC tokens because they functionally sit here
     * and belong to stakers but can rescue wrapped iBTC as they should never actually
     * sit in this contract and a staker may well transfer them here by accident.
     * @param token The token to be rescued.
     * @param amount The amount of tokens to be rescued.
     * @param to Where to send rescued tokens
     */
    function rescueTokens(
        address token,
        uint256 amount,
        address to
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(token) == asset()) revert InvalidToken();
        IERC20(token).safeTransfer(to, amount);
    }
}
