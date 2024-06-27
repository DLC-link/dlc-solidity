// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/**
 * @author  DLC.Link 2024
 * @title   DLCLinkCompatible
 * @dev     Protocol-contracts MUST implement this interface to be compatible with the DLCManager contract
 * @notice  A simple interface for accepting callbacks from the DLCManager contract
 */
interface DLCLinkCompatible {
    function setStatusFunded(bytes32 uuid, string calldata btcTxId, uint256 valueMinted) external;
    function setStatusPending(bytes32 uuid, string calldata btcTxId) external;

    function postCloseDLCHandler(
        bytes32 uuid,
        string calldata btcTxId
    ) external;
}
