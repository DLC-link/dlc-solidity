// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./DLCLinkLibrary.sol";

interface IDLCManager {
    function createDLC(
        uint256 _valueLocked,
        string calldata _btcFeeRecipient,
        uint256 _btcFeeBasisPoints
    ) external returns (bytes32);

    function setStatusFunded(bytes32 _uuid, string calldata _btcTxId) external;

    function closeDLC(bytes32 _uuid) external;

    function postCloseDLC(bytes32 _uuid, string calldata _btcTxId) external;

    function getDLC(bytes32 _uuid) external view returns (DLCLink.DLC memory);
}
