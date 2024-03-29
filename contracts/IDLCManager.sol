// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "./DLCLinkLibrary.sol";

interface IDLCManager {
    function createDLC(
        uint256 _valueLocked,
        string calldata _btcFeeRecipient,
        uint256 _btcMintFeeBasisPoints,
        uint256 _btcRedeemFeeBasisPoints
    ) external returns (bytes32);

    function setStatusFunded(
        bytes32 _uuid,
        string calldata _btcTxId,
        bytes[] calldata _signatures
    ) external;

    function closeDLC(bytes32 _uuid) external;

    function postCloseDLC(
        bytes32 _uuid,
        string calldata _btcTxId,
        bytes[] calldata _signatures
    ) external;

    function getDLC(bytes32 _uuid) external view returns (DLCLink.DLC memory);
}
