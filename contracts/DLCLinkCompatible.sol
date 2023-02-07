// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface DLCLinkCompatible {
    function postCreateDLCHandler(bytes32 uuid) external;

    function setStatusFunded(bytes32 uuid) external;

    function postCloseDLCHandler(bytes32 uuid) external;

    function getBtcPriceCallback(
        bytes32 uuid,
        int256 price,
        uint256 timestamp
    ) external;
}
