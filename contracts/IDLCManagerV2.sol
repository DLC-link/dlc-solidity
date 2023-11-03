// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IDLCManagerV2 {
    function createDLC(
        address _protocolWallet
    ) external returns (bytes32, string[] memory);

    function createDLC(
        address _protocolWallet,
        uint8 _attestorCount
    ) external returns (bytes32, string[] memory);

    function setStatusFunded(bytes32 _uuid, string calldata _btcTxId) external;

    function closeDLC(bytes32 _uuid, uint256 _outcome) external;

    function postCloseDLC(bytes32 _uuid, string calldata _btcTxId) external;
}
