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
import "./DLCLinkLibrary.sol";
import "./DLCManager.sol";

contract PoolMerchant is
    Initializable,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable
{
    using DLCLink for DLCLink.DLC;
    using Strings for string;

    bytes32 public constant DLC_ADMIN_ROLE =
        0x2bf88000669ee6f7a648a231f4adbc117f5a8e34f980c08420b9b9a9f2640aa1; // keccak256("DLC_ADMIN_ROLE")

    DLCManager public dlcManager;
    uint256 private _nonce;
    mapping(bytes32 => string) public uuidToTaprootPubkey;

    function initialize(
        address defaultAdmin,
        address dlcAdminRole,
        DLCManager dlcManagerContract
    ) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, defaultAdmin);
        _grantRole(DLC_ADMIN_ROLE, dlcAdminRole);
        dlcManager = dlcManagerContract;
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
    function createPendingVault(
        bytes32 uuid,
        string memory taprootPubkey,
        string calldata wdTxId
    ) public {
        if (uuidToTaprootPubkey[uuid].equal(taprootPubkey)) {
            revert VaultAlreadyExists(uuid);
        }
        uuidToTaprootPubkey[uuid] = taprootPubkey;
        dlcManager.setupPendingVault(uuid, taprootPubkey, wdTxId);
    }

    function getSharesForUUID(bytes32 uuid) public view returns (uint256) {
        DLCLink.DLC memory _dlc = dlcManager.getDLC(uuid);
        uint256 shares = _dlc.valueMinted;
        return shares;
    }

    // sweepDeposit() {
    //  loop vaults and perform deposit for vaults where there is new shares
    //}
}
