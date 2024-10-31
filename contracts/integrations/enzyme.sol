// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IIntegration.sol";

interface IGlobalConfigLibComptrollerV4 {
    function buyShares(
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    ) external returns (uint256 sharesReceived_);

    function getDenominationAsset()
        external
        view
        returns (address denominationAsset_);

    function redeemSharesForSpecificAssets(
        address _recipient,
        uint256 _sharesQuantity,
        address[] calldata _payoutAssets,
        uint256[] calldata _payoutAssetPercentages
    ) external returns (uint256[] memory payoutAmounts_);
}

contract EnzymeIntegration is IIntegration, Ownable {
    address public enzymeVaultAddress;
    IGlobalConfigLibComptrollerV4 public enzymeVault;
    address public dlcBTC;

    constructor(
        address _enzymeVaultAddress,
        address _poolMerchant,
        address _dlcBTC
    ) Ownable() {
        enzymeVaultAddress = _enzymeVaultAddress;
        enzymeVault = IGlobalConfigLibComptrollerV4(enzymeVaultAddress);
        dlcBTC = _dlcBTC;

        // Verify that vault's denomination asset is dlcBTC
        require(
            enzymeVault.getDenominationAsset() == dlcBTC,
            "Vault denomination asset must be dlcBTC"
        );

        transferOwnership(_poolMerchant);
    }

    function deposit(
        uint256 amount
    ) external override onlyOwner returns (uint256 shares) {
        // The dlcBTC tokens are still in the PoolMerchant, which has approved us to spend them

        // Transfer the dlcBTC from PoolMerchant and approve Enzyme vault to spend it
        IERC20(dlcBTC).transferFrom(msg.sender, address(this), amount);
        IERC20(dlcBTC).approve(enzymeVaultAddress, amount);

        // Buy shares in the Enzyme vault
        shares = enzymeVault.buyShares(amount, 1); // minimum 1 share

        return shares;
    }

    function withdraw(
        uint256 shares
    ) external override onlyOwner returns (uint256 amount) {
        // Setup redemption parameters for dlcBTC only
        address[] memory payoutAssets = new address[](1);
        payoutAssets[0] = dlcBTC;

        uint256[] memory payoutPercentages = new uint256[](1);
        payoutPercentages[0] = 10000; // 100% in basis points

        // Redeem shares for dlcBTC
        uint256[] memory amounts = enzymeVault.redeemSharesForSpecificAssets(
            msg.sender, // Send directly to PoolMerchant
            shares,
            payoutAssets,
            payoutPercentages
        );

        return amounts[0];
    }

    // Since Enzyme doesn't have a direct reward claiming mechanism like Curve,
    // we'll implement empty reward functions to maintain interface compatibility

    function claimRewards()
        external
        view
        override
        onlyOwner
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](0);
        return amounts;
    }

    function getRewardTokens()
        external
        pure
        override
        returns (address[] memory tokens)
    {
        tokens = new address[](0);
        return tokens;
    }

    function getPendingRewards()
        external
        pure
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](0);
        return amounts;
    }
}
