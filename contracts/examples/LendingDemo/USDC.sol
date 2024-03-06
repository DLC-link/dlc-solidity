// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20FlashMint.sol";

/// @custom:security-contact jesse@dlc.link
contract USDStableCoinForDLCs is ERC20, ERC20Burnable, Ownable, ERC20FlashMint {
    constructor() ERC20("USD Stable Coin For DLCs", "USDC") {}

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
