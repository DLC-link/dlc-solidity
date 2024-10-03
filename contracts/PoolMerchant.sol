// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/access/AccessControlDefaultAdminRulesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./DLCLinkLibrary.sol";
import "./DLCManager.sol";

// interface IEnzymeVault {
//     function buyShares(
//         uint256 _investmentAmount,
//         uint256 _minSharesQuantity
//     ) external returns (uint256);
// }

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

    function redeemSharesInKind(
        address _recipient,
        uint256 _sharesQuantity,
        address[] calldata _additionalAssets,
        address[] calldata _assetsToSkip
    )
        external
        returns (
            address[] memory payoutAssets_,
            uint256[] memory payoutAmounts_
        );
}

contract PoolMerchant is
    Initializable,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable
{
    using DLCLink for DLCLink.DLC;
    using Strings for string;
    using SafeERC20 for IERC20;

    bytes32 public constant DLC_ADMIN_ROLE =
        0x2bf88000669ee6f7a648a231f4adbc117f5a8e34f980c08420b9b9a9f2640aa1; // keccak256("DLC_ADMIN_ROLE")

    IGlobalConfigLibComptrollerV4 public enzymeVault;
    DLCManager public dlcManager;
    IERC20 public dlcBTC;
    uint256 private _nonce;
    mapping(bytes32 => string) public uuidToTaprootPubkey;
    mapping(bytes32 => address) public uuidToUserAddress;
    mapping(bytes32 => uint256) public sweptAmounts;

    function initialize(
        address defaultAdmin,
        address dlcAdminRole,
        address dlcManagerContract,
        address dlcBTCContract,
        address enzymeVaultContract
    ) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, defaultAdmin);
        _grantRole(DLC_ADMIN_ROLE, dlcAdminRole);
        dlcManager = DLCManager(dlcManagerContract);
        dlcBTC = IERC20(dlcBTCContract);
        enzymeVault = IGlobalConfigLibComptrollerV4(enzymeVaultContract);
        _nonce = 0;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    error VaultAlreadyExists(bytes32 uuid);

    function getNewUUID(address userAddress) public view returns (bytes32) {
        return dlcManager.generateUUID(userAddress, block.timestamp);
    }

    // TODO: auth
    // called by attestors
    function createPendingVault(
        address userAddress,
        bytes32 uuid,
        string memory taprootPubkey,
        string calldata wdTxId
    ) public {
        if (uuidToTaprootPubkey[uuid].equal(taprootPubkey)) {
            revert VaultAlreadyExists(uuid);
        }
        uuidToTaprootPubkey[uuid] = taprootPubkey;
        uuidToUserAddress[uuid] = userAddress;
        dlcManager.setupPendingVault(uuid, taprootPubkey, wdTxId);
    }

    function getSharesForUUID(bytes32 uuid) public view returns (uint256) {
        DLCLink.DLC memory _dlc = dlcManager.getDLC(uuid);
        uint256 shares = _dlc.valueMinted;
        return shares;
    }

    function getSweptAmountForUUID(bytes32 uuid) public view returns (uint256) {
        return sweptAmounts[uuid];
    }

    // called by attestors
    function sweepDeposit() public {
        DLCLink.DLC[] memory _allDLCs = dlcManager.getAllVaultsForAddress(
            address(this)
        );

        for (uint256 i = 0; i < _allDLCs.length; i++) {
            bytes32 uuid = _allDLCs[i].uuid;
            uint256 currentValueMinted = _allDLCs[i].valueMinted;
            uint256 sweptAmount = sweptAmounts[uuid];

            if (currentValueMinted > sweptAmount) {
                uint256 difference = currentValueMinted - sweptAmount;

                // Approve the Enzyme vault to spend dlcBTC tokens
                dlcBTC.approve(address(enzymeVault), difference);

                // Simulate the call to buyShares to get the _minSharesQuantity
                (bool success, bytes memory result) = address(enzymeVault)
                    .staticcall(
                        abi.encodeWithSignature(
                            "buyShares(uint256,uint256)",
                            difference,
                            1
                        )
                    );

                require(success, "Static call to buyShares failed");

                uint256 minSharesQuantity = abi.decode(result, (uint256));

                // Actual call to buyShares with the obtained minSharesQuantity
                enzymeVault.buyShares(difference, minSharesQuantity);

                sweptAmounts[uuid] = currentValueMinted; // Update the local tracker
            }
        }
    }
}
