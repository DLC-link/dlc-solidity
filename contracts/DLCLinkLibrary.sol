// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.17;

library DLCLink {
    enum DLCStatus {
        READY,
        FUNDED,
        CLOSING,
        CLOSED
    }

    struct DLC {
        bytes32 uuid;
        address protocolWallet;
        address protocolContract;
        uint256 timestamp;
        uint256 valueLocked;
        uint256 refundDelay;
        address creator;
        uint256 outcome;
        DLCStatus status;
        string fundingTxId;
        string closingTxId;
    }
}
