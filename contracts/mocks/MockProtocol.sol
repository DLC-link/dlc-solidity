// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../DLCManager.sol";
import "../DLCLinkCompatible.sol";

// import "hardhat/console.sol";

contract MockProtocol is DLCLinkCompatible {
    DLCManager private _dlcManager;
    address private _protocolWallet;

    constructor(address _dlcManagerAddress, address protocolWallet) {
        require(
            _dlcManagerAddress != address(0),
            "DLCManager address cannot be 0"
        );
        require(
            protocolWallet != address(0),
            "Protocol wallet address cannot be 0"
        );
        _dlcManager = DLCManager(_dlcManagerAddress);
        _protocolWallet = protocolWallet;
    }

    function requestCreateDLC(uint256 _valueLocked) external returns (bytes32) {
        bytes32 uuid = _dlcManager.createDLC(_protocolWallet, _valueLocked);
        // console.log('[MockProtocol] requestCreateDLC called');
        // console.logBytes32(uuid);
        return (uuid);
    }

    function requestCloseDLC(bytes32 _uuid, uint16 _outcome) external {
        // console.log('[MockProtocol] requestCloseDLC called');
        // console.logBytes32(uuid);
        _dlcManager.closeDLC(_uuid, _outcome);
    }

    function setStatusFunded(
        bytes32 uuid,
        string calldata btcTxId
    ) external view override {
        // console.log('[MockProtocol] setStatusFunded called');
        // console.logBytes32(uuid);
    }

    function postCloseDLCHandler(
        bytes32 uuid,
        string calldata btxTxId
    ) external view override {
        // console.log('[MockProtocol] postCloseDLCHandler called');
        // console.logBytes32(uuid);
    }
}
