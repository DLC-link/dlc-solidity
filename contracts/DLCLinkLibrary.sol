// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.18;

library DLCLink {
    enum DLCStatus {
        READY,
        FUNDED,
        CLOSING,
        CLOSED,
        PENDING,
        AUX_STATE_2,
        AUX_STATE_3,
        AUX_STATE_4,
        AUX_STATE_5
    }

    struct DLC {
        bytes32 uuid;
        address protocolContract;
        uint256 timestamp;
        uint256 valueLocked;
        address creator;
        DLCStatus status;
        string fundingTxId;
        string closingTxId;
        string btcFeeRecipient;
        uint256 btcMintFeeBasisPoints;
        uint256 btcRedeemFeeBasisPoints;
        string taprootPubKey;
        uint256 valueMinted;
        string wdTxId;
    }
}
