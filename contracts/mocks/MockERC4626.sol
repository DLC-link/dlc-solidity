// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC4626Vault is ERC4626 {
    constructor(
        IERC20Metadata _asset
    ) ERC20("Mock Vault Token", "MVT") ERC4626(_asset) {}

    // function deposit(
    //     uint256 assets,
    //     address receiver
    // ) public override returns (uint256) {
    //     require(assets > 0, "Assets must be greater than 0");
    //     IERC20(asset()).transferFrom(msg.sender, address(this), assets);
    //     uint256 shares = convertToShares(assets);
    //     require(shares > 0, "Shares must be greater than 0");
    //     _mint(receiver, shares);
    //     emit Deposit(msg.sender, receiver, assets, shares);
    //     return shares;
    // }

    // function totalAssets() public view override returns (uint256) {
    //     return IERC20(asset()).balanceOf(address(this));
    // }

    // function convertToShares(
    //     uint256 assets
    // ) public view override returns (uint256) {
    //     uint256 supply = totalSupply();
    //     uint256 totalAsset = totalAssets();
    //     if (supply == 0 || totalAsset == 0) {
    //         return assets;
    //     } else {
    //         return (assets * supply) / totalAsset;
    //     }
    // }

    // function convertToAssets(
    //     uint256 shares
    // ) public view override returns (uint256) {
    //     uint256 supply = totalSupply();
    //     uint256 totalAsset = totalAssets();
    //     if (supply == 0 || totalAsset == 0) {
    //         return shares;
    //     } else {
    //         return (shares * totalAsset) / supply;
    //     }
    // }

    // function redeem(
    //     uint256 shares,
    //     address receiver,
    //     address owner
    // ) public override returns (uint256) {
    //     require(shares > 0, "Shares must be greater than 0");
    //     require(balanceOf(owner) >= shares, "Insufficient shares");

    //     if (msg.sender != owner) {
    //         uint256 allowed = allowance(owner, msg.sender);
    //         require(allowed >= shares, "ERC20: insufficient allowance");
    //         _approve(owner, msg.sender, allowed - shares);
    //     }

    //     uint256 assets = convertToAssets(shares);
    //     uint256 totalAsset = totalAssets();
    //     require(totalAsset >= assets, "Vault does not have enough assets");

    //     _burn(owner, shares);
    //     require(IERC20(asset()).transfer(receiver, assets), "Transfer failed");

    //     emit Withdraw(msg.sender, receiver, owner, assets, shares);
    //     return assets;
    // }
}
