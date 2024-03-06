// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @author  DLC.Link 2024
 * @title   DLCBTC
 * @notice  The DLCBTC Token represents Bitcoin locked through the DLC.Link bridge
 * @dev     Owner is the TokenManager contract
 * @custom:contact robert@dlc.link
 * @custom:website https://www.dlc.link
 */
contract DLCBTC is ERC20, Ownable {
    constructor() ERC20("dlcBTC", "DLCBTC") {}

    // Representing Satoshis
    function decimals() public view virtual override returns (uint8) {
        return 8;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
