// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC4626Vault is ERC4626 {
    constructor(
        IERC20Metadata _asset
    ) ERC20("Mock Vault Token", "MVT") ERC4626(_asset) {}
}
