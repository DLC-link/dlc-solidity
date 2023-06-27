// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

import '../DLCManagerV1.sol';
import '../DLCLinkCompatibleV1.sol';

import 'hardhat/console.sol';

contract MockProtocol is DLCLinkCompatibleV1 {
    DLCManagerV1 private _dlcManager;
    address private _protocolWallet;

    constructor(address _dlcManagerAddress, address protocolWallet) {
        require(
            _dlcManagerAddress != address(0),
            'DLCManager address cannot be 0'
        );
        require(
            protocolWallet != address(0),
            'Protocol wallet address cannot be 0'
        );
        _dlcManager = DLCManagerV1(_dlcManagerAddress);
        _protocolWallet = protocolWallet;
    }

    function requestCreateDLC(
        uint8 attestorCount
    ) external returns (bytes32, string[] memory) {
        (bytes32 uuid, string[] memory attestorList) = _dlcManager.createDLC(
            _protocolWallet,
            attestorCount
        );
        // console.log('[MockProtocol] requestCreateDLC called');
        // console.logBytes32(uuid);
        return (uuid, attestorList);
    }

    function requestCloseDLC(bytes32 _uuid, uint256 _outcome) external {
        // console.log('[MockProtocol] requestCloseDLC called');
        // console.logBytes32(uuid);
        _dlcManager.closeDLC(_uuid, _outcome);
    }

    function postCreateDLCHandler(bytes32 uuid) external view override {
        // console.log('[MockProtocol] postCreateDLCHandler called');
        // console.logBytes32(uuid);
    }

    function setStatusFunded(bytes32 uuid) external view override {
        // console.log('[MockProtocol] setStatusFunded called');
        // console.logBytes32(uuid);
    }

    function postCloseDLCHandler(bytes32 uuid) external view override {
        // console.log('[MockProtocol] postCloseDLCHandler called');
        // console.logBytes32(uuid);
    }
}
