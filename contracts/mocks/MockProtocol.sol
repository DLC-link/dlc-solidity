// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../DLCManager.sol";
import "../DLCLinkCompatible.sol";

// import "hardhat/console.sol";

contract MockProtocol is DLCLinkCompatible {
    DLCManager private _dlcManager;

    constructor(address _dlcManagerAddress) {
        require(
            _dlcManagerAddress != address(0),
            "DLCManager address cannot be 0"
        );
        _dlcManager = DLCManager(_dlcManagerAddress);
    }

    function requestCreateDLC() external returns (bytes32) {
        bytes32 uuid = _dlcManager.createDLC("", 0, 0);
        // console.log('[MockProtocol] requestCreateDLC called');
        // console.logBytes32(uuid);
        return (uuid);
    }

    function requestCloseDLC(bytes32 _uuid) external {
        // console.log('[MockProtocol] requestCloseDLC called');
        // console.logBytes32(uuid);
        _dlcManager.closeDLC(_uuid);
    }

    function setStatusFunded(
        bytes32 uuid,
        string calldata btcTxId,
        uint256 valueMinted
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
