// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./DLCLinkLibrary.sol";

interface IDLCManager {
    function createDLC(
        address _protocolWallet,
        uint256 _valueLocked
    ) external returns (bytes32);

    function createDLC(
        address _protocolWallet,
        uint256 _valueLocked,
        uint256 _refundDelay
    ) external returns (bytes32);

    function setStatusFunded(bytes32 _uuid, string calldata _btcTxId) external;

    function closeDLC(bytes32 _uuid, uint256 _outcome) external;

    function postCloseDLC(bytes32 _uuid, string calldata _btcTxId) external;

    function getDLC(bytes32 _uuid) external view returns (DLCLink.DLC memory);
}
