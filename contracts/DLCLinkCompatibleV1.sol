// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface DLCLinkCompatibleV1 {
    function setStatusFunded(bytes32 uuid) external;

    function postCloseDLCHandler(
        bytes32 uuid,
        string calldata btcTxId
    ) external;
}
