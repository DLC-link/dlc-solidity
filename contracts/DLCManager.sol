// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/access/AccessControlDefaultAdminRulesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "./DLCLinkCompatible.sol";
import "./IDLCManager.sol";
import "./DLCLinkLibrary.sol";

/**
 * @author  DLC.Link 2024
 * @title   DLCManager
 * @dev     This is the contract the Attestor Layer listens to.
 * Protocol contracts should implement the DLCLinkCompatible interface and interact with this contract.
 * @dev     It is upgradable through the OpenZeppelin proxy pattern
 * @notice  DLCManager is the main contract of the DLC.Link protocol.
 * @custom:contact robert@dlc.link
 * @custom:website https://www.dlc.link
 */
contract DLCManager is
    Initializable,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable,
    IDLCManager
{
    using DLCLink for DLCLink.DLC;
    using DLCLink for DLCLink.DLCStatus;

    ////////////////////////////////////////////////////////////////
    //                      STATE VARIABLES                       //
    ////////////////////////////////////////////////////////////////

    bytes32 public constant DLC_ADMIN_ROLE =
        0x2bf88000669ee6f7a648a231f4adbc117f5a8e34f980c08420b9b9a9f2640aa1; // keccak256("DLC_ADMIN_ROLE")
    bytes32 public constant WHITELISTED_CONTRACT =
        0xec26500344858148ae6c4dd068dc3bae426095ee44cdb32b94288d883648f619; // keccak256("WHITELISTED_CONTRACT")

    uint256 private _index;
    mapping(uint256 => DLCLink.DLC) public dlcs;
    mapping(bytes32 => uint256) public dlcIDsByUUID;

    uint16 private _minimumThreshold;
    uint16 private _threshold;
    mapping(address => bool) private _approvedSigners;
    uint16 private _signerCount;
    mapping(bytes32 => uint256) private _signatureCounts;
    bytes32 public tssCommitment;

    ////////////////////////////////////////////////////////////////
    //                           ERRORS                           //
    ////////////////////////////////////////////////////////////////

    error NotDLCAdmin();
    error ContractNotWhitelisted();
    error NotCreatorContract();
    error DLCNotFound();
    error DLCNotReady();
    error DLCNotFunded();
    error DLCNotClosing();

    error ThresholdMinimumReached(uint16 _minimumThreshold);
    error ThresholdTooLow(uint16 _minimumThreshold);
    error Unauthorized();
    error NotEnoughSignatures();
    error InvalidSigner();
    error DuplicateSignature();
    error SignerNotApproved(address signer);

    ////////////////////////////////////////////////////////////////
    //                         MODIFIERS                          //
    ////////////////////////////////////////////////////////////////

    modifier onlyAdmin() {
        if (!hasRole(DLC_ADMIN_ROLE, msg.sender)) revert NotDLCAdmin();
        _;
    }

    modifier onlyWhiteListedContracts() {
        if (!hasRole(WHITELISTED_CONTRACT, msg.sender))
            revert ContractNotWhitelisted();
        _;
    }

    modifier onlyApprovedSigners() {
        if (!_approvedSigners[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyCreatorContract(bytes32 _uuid) {
        if (dlcs[dlcIDsByUUID[_uuid]].protocolContract != msg.sender)
            revert NotCreatorContract();
        _;
    }

    function initialize(
        address adminAddress,
        uint16 threshold
    ) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, adminAddress);
        _grantRole(DLC_ADMIN_ROLE, adminAddress);
        _threshold = threshold;
        _index = 0;
        _minimumThreshold = 2;
        tssCommitment = 0x0;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    ////////////////////////////////////////////////////////////////
    //                          EVENTS                            //
    ////////////////////////////////////////////////////////////////

    event CreateDLC(
        bytes32 uuid,
        uint256 valueLocked,
        address protocolContract,
        address creator,
        uint256 timestamp
    );

    event SetStatusFunded(bytes32 uuid, string btcTxId, address sender);

    event CloseDLC(bytes32 uuid, address sender);

    event PostCloseDLC(bytes32 uuid, string btcTxId, address sender);

    event SetThreshold(uint16 newThreshold);

    ////////////////////////////////////////////////////////////////
    //                    INTERNAL FUNCTIONS                      //
    ////////////////////////////////////////////////////////////////

    function _generateUUID(
        address sender,
        uint256 nonce
    ) private view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(sender, nonce, blockhash(block.number - 1))
            );
    }

    /**
     * @notice  Checks the 'signatures' of Attestors for a given 'message'.
     * @dev     Recalculates the hash to make sure the signatures are for the same message.
     * @dev     Uses OpenZeppelin's ECDSA library to recover the public keys from the signatures.
     * @param   message  Original message that was signed.
     * @param   signatures  Byte array of at least 'threshold' number of signatures.
     */
    function _attestorMultisigIsValid(
        bytes memory message,
        bytes[] memory signatures
    ) internal {
        if (signatures.length < _threshold) revert NotEnoughSignatures();

        bytes32 prefixedMessageHash = ECDSAUpgradeable.toEthSignedMessageHash(
            keccak256(message)
        );

        for (uint256 i = 0; i < signatures.length; i++) {
            address attestorPubKey = ECDSAUpgradeable.recover(
                prefixedMessageHash,
                signatures[i]
            );
            if (!_approvedSigners[attestorPubKey]) revert InvalidSigner();

            // Prevent a signer from signing the same message multiple times
            bytes32 signedHash = keccak256(
                abi.encodePacked(prefixedMessageHash, attestorPubKey)
            );
            if (_signatureCounts[signedHash] != 0) revert DuplicateSignature();
            _signatureCounts[signedHash] = 1;
        }
    }

    ////////////////////////////////////////////////////////////////
    //                       MAIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    /**
     * @notice  Triggers the creation of an Announcement in the Attestor Layer.
     * @dev     Call this function from a whitelisted protocol-contract.
     * @param   valueLocked  Value to be locked in the DLC , in Satoshis.
     * @param   btcFeeRecipient  Bitcoin address that will receive the DLC fees.
     * @param   btcMintFeeBasisPoints  Basis points of the minting fee.
     * @param   btcRedeemFeeBasisPoints  Basis points of the redeeming fee.
     * @return  bytes32  A generated UUID.
     */
    function createDLC(
        uint256 valueLocked,
        string calldata btcFeeRecipient,
        uint256 btcMintFeeBasisPoints,
        uint256 btcRedeemFeeBasisPoints
    )
        external
        override
        onlyWhiteListedContracts
        whenNotPaused
        returns (bytes32)
    {
        bytes32 _uuid = _generateUUID(tx.origin, _index);

        dlcs[_index] = DLCLink.DLC({
            uuid: _uuid,
            protocolContract: msg.sender,
            valueLocked: valueLocked,
            timestamp: block.timestamp,
            creator: tx.origin,
            status: DLCLink.DLCStatus.READY,
            fundingTxId: "",
            closingTxId: "",
            btcFeeRecipient: btcFeeRecipient,
            btcMintFeeBasisPoints: btcMintFeeBasisPoints,
            btcRedeemFeeBasisPoints: btcRedeemFeeBasisPoints
        });

        emit CreateDLC(
            _uuid,
            valueLocked,
            msg.sender,
            tx.origin,
            block.timestamp
        );

        dlcIDsByUUID[_uuid] = _index;
        _index++;

        return _uuid;
    }

    /**
     * @notice  Confirms that a DLC was 'funded' on the Bitcoin blockchain.
     * @dev     Called by the Attestor Coordinator.
     * @param   uuid  UUID of the DLC.
     * @param   btcTxId  DLC Funding Transaction ID on the Bitcoin blockchain.
     * @param   signatures  Signatures of the Attestors.
     */
    function setStatusFunded(
        bytes32 uuid,
        string calldata btcTxId,
        bytes[] calldata signatures
    ) external whenNotPaused onlyApprovedSigners {
        _attestorMultisigIsValid(abi.encode(uuid, btcTxId), signatures);
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[uuid]];

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.READY) revert DLCNotReady();

        dlc.fundingTxId = btcTxId;
        dlc.status = DLCLink.DLCStatus.FUNDED;

        DLCLinkCompatible(dlc.protocolContract).setStatusFunded(uuid, btcTxId);

        emit SetStatusFunded(uuid, btcTxId, msg.sender);
    }

    /**
     * @notice  Triggers the creation of an Attestation.
     * @param   uuid  UUID of the DLC.
     */
    function closeDLC(
        bytes32 uuid
    ) external onlyCreatorContract(uuid) whenNotPaused {
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[uuid]];

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.FUNDED) revert DLCNotFunded();

        dlc.status = DLCLink.DLCStatus.CLOSING;

        emit CloseDLC(uuid, msg.sender);
    }

    /**
     * @notice  Triggered after a closing Tx has been confirmed Bitcoin.
     * @dev     Similarly to setStatusFunded, this is called by the Attestor Coordinator.
     * @param   uuid  UUID of the DLC.
     * @param   btcTxId  Closing Bitcoin Tx id.
     * @param   signatures  Signatures of the Attestors.
     */
    function postCloseDLC(
        bytes32 uuid,
        string calldata btcTxId,
        bytes[] calldata signatures
    ) external whenNotPaused onlyApprovedSigners {
        _attestorMultisigIsValid(abi.encode(uuid, btcTxId), signatures);
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[uuid]];

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.CLOSING) revert DLCNotClosing();

        dlc.closingTxId = btcTxId;
        dlc.status = DLCLink.DLCStatus.CLOSED;

        DLCLinkCompatible(dlc.protocolContract).postCloseDLCHandler(
            uuid,
            btcTxId
        );

        emit PostCloseDLC(uuid, btcTxId, msg.sender);
    }

    ////////////////////////////////////////////////////////////////
    //                      VIEW FUNCTIONS                        //
    ////////////////////////////////////////////////////////////////

    function getDLC(
        bytes32 uuid
    ) external view override returns (DLCLink.DLC memory) {
        DLCLink.DLC memory _dlc = dlcs[dlcIDsByUUID[uuid]];
        if (_dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (_dlc.uuid != uuid) revert DLCNotFound();
        return _dlc;
    }

    function getDLCByIndex(
        uint256 index
    ) external view returns (DLCLink.DLC memory) {
        return dlcs[index];
    }

    function getFundedTxIds() public view returns (string[] memory) {
        string[] memory _fundedTxIds = new string[](_index);
        uint256 _fundedTxIdsCount = 0;
        for (uint256 i = 0; i < _index; i++) {
            if (dlcs[i].status == DLCLink.DLCStatus.FUNDED) {
                _fundedTxIds[_fundedTxIdsCount] = dlcs[i].fundingTxId;
                _fundedTxIdsCount++;
            }
        }
        return _fundedTxIds;
    }

    ////////////////////////////////////////////////////////////////
    //                      ADMIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    function pauseContract() external onlyAdmin {
        _pause();
    }

    function unpauseContract() external onlyAdmin {
        _unpause();
    }

    function getThreshold() external view onlyAdmin returns (uint16) {
        return _threshold;
    }

    function setThreshold(uint16 newThreshold) external onlyAdmin {
        if (newThreshold < _minimumThreshold)
            revert ThresholdTooLow(_minimumThreshold);
        _threshold = newThreshold;
        emit SetThreshold(newThreshold);
    }

    function addApprovedSigner(address signer) external onlyAdmin {
        _approvedSigners[signer] = true;
        _signerCount++;
    }

    function removeApprovedSigner(address signer) external onlyAdmin {
        if (_signerCount == _minimumThreshold)
            revert ThresholdMinimumReached(_minimumThreshold);
        if (!_approvedSigners[signer]) revert SignerNotApproved(signer);
        _approvedSigners[signer] = false;
        _signerCount--;
    }

    function setTSSCommitment(bytes32 commitment) external onlyAdmin {
        tssCommitment = commitment;
    }
}
