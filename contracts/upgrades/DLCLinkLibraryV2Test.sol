// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.18;

library DLCLinkV2 {
    enum DLCStatus {
        READY,
        FUNDED,
        CLOSING,
        CLOSED,
        AUX_STATE_1,
        AUX_STATE_2,
        AUX_STATE_3,
        AUX_STATE_4,
        AUX_STATE_5,
        AUX_STATE_6,
        AUX_STATE_7,
        AUX_STATE_8,
        AUX_STATE_9,
        AUX_STATE_10
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
        address someNewField;
    }
}
