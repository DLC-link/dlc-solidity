// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlDefaultAdminRulesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "./DLCLinkCompatible.sol";
import "./IDLCManager.sol";
import "./DLCLinkLibrary.sol";

// TODO:
// - proxyadmin should be 25 people across the globe
// - minimumThreshold variable? hardcoded?
// - threshold in the constructor should be checked
// - _approvedSigner counter?

/**
 * @author  DLC.Link 2023
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

    uint16 private _threshold;
    mapping(address => bool) private _approvedSigners;
    mapping(bytes32 => uint256) private _signatureCounts;

    ////////////////////////////////////////////////////////////////
    //                           ERRORS                           //
    ////////////////////////////////////////////////////////////////

    error NotDLCAdmin();
    error ContractNotWhitelisted();
    error NotCreatorContract();
    error WrongDLCState();
    error DLCNotFound();
    error DLCNotReady();
    error DLCNotFunded();
    error DLCNotClosing();

    error InvalidSignatures();
    error NotEnoughSignatures();
    error InvalidHash();
    error InvalidSigner();
    error DuplicateSignature();

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

    modifier onlyCreatorContract(bytes32 _uuid) {
        if (dlcs[dlcIDsByUUID[_uuid]].protocolContract != msg.sender)
            revert NotCreatorContract();
        _;
    }

    function initialize(
        address _adminAddress,
        uint16 threshold
    ) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, _adminAddress);
        _grantRole(DLC_ADMIN_ROLE, _adminAddress);
        _threshold = threshold;
        _index = 0;
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

    function _attestorMultisigIsValid(
        bytes memory _message,
        bytes32 _hash,
        bytes[] memory _signatures
    ) internal {
        if (_signatures.length < _threshold) revert NotEnoughSignatures();

        bytes32 prefixedMessageHash = ECDSAUpgradeable.toEthSignedMessageHash(
            keccak256(_message)
        );
        if (_hash != prefixedMessageHash) revert InvalidHash();

        bytes32 signedMessage = ECDSAUpgradeable.toEthSignedMessageHash(_hash);

        for (uint256 i = 0; i < _signatures.length; i++) {
            address attestorPubKey = ECDSAUpgradeable.recover(
                signedMessage,
                _signatures[i]
            );
            if (!_approvedSigners[attestorPubKey]) revert InvalidSigner();

            // Prevent a signer from signing the same message multiple times
            bytes32 signedHash = keccak256(
                abi.encodePacked(signedMessage, attestorPubKey)
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
     * @param   _valueLocked  Value to be locked in the DLC , in Satoshis.
     * @param   _btcFeeRecipient  Bitcoin address that will receive the DLC fees.
     * @param   _btcMintFeeBasisPoints  Basis points of the minting fee.
     * @param   _btcRedeemFeeBasisPoints  Basis points of the redeeming fee.
     * @return  bytes32  A generated UUID.
     */
    function createDLC(
        uint256 _valueLocked,
        string calldata _btcFeeRecipient,
        uint256 _btcMintFeeBasisPoints,
        uint256 _btcRedeemFeeBasisPoints
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
            valueLocked: _valueLocked,
            timestamp: block.timestamp,
            creator: tx.origin,
            status: DLCLink.DLCStatus.READY,
            fundingTxId: "",
            closingTxId: "",
            btcFeeRecipient: _btcFeeRecipient,
            btcMintFeeBasisPoints: _btcMintFeeBasisPoints,
            btcRedeemFeeBasisPoints: _btcRedeemFeeBasisPoints
        });

        emit CreateDLC(
            _uuid,
            _valueLocked,
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
     * @param   _uuid  UUID of the DLC.
     * @param   _btcTxId  DLC Funding Transaction ID on the Bitcoin blockchain.
     * @param   _hash  Hash of the message signed by the Attestors.
     * @param   _signatures  Signatures of the Attestors.
     */
    function setStatusFunded(
        bytes32 _uuid,
        string calldata _btcTxId,
        bytes32 _hash,
        bytes[] calldata _signatures
    ) external whenNotPaused {
        _attestorMultisigIsValid(
            abi.encodePacked(_uuid, _btcTxId),
            _hash,
            _signatures
        );
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[_uuid]];

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.READY) revert DLCNotReady();

        dlc.fundingTxId = _btcTxId;
        dlc.status = DLCLink.DLCStatus.FUNDED;

        DLCLinkCompatible(dlc.protocolContract).setStatusFunded(
            _uuid,
            _btcTxId
        );

        emit SetStatusFunded(_uuid, _btcTxId, msg.sender);
    }

    /**
     * @notice  Triggers the creation of an Attestation.
     * @param   _uuid  UUID of the DLC.
     */
    function closeDLC(
        bytes32 _uuid
    ) external onlyCreatorContract(_uuid) whenNotPaused {
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[_uuid]];
        DLCLink.DLCStatus _newStatus = DLCLink.DLCStatus.CLOSING;

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.FUNDED) revert DLCNotFunded();

        dlc.status = _newStatus;

        emit CloseDLC(_uuid, msg.sender);
    }

    /**
     * @notice  Triggered after a closing Tx has been confirmed Bitcoin.
     * @dev     Similarly to setStatusFunded, this is called by the Attestor Coordinator.
     * @param   _uuid  UUID of the DLC.
     * @param   _btcTxId  Closing Bitcoin Tx id.
     * @param   _hash  Hash of the message signed by the Attestors.
     * @param   _signatures  Signatures of the Attestors.
     */
    function postCloseDLC(
        bytes32 _uuid,
        string calldata _btcTxId,
        bytes32 _hash,
        bytes[] calldata _signatures
    ) external whenNotPaused {
        _attestorMultisigIsValid(
            abi.encodePacked(_uuid, _btcTxId),
            _hash,
            _signatures
        );
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[_uuid]];

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.CLOSING) revert DLCNotClosing();

        dlc.closingTxId = _btcTxId;
        dlc.status = DLCLink.DLCStatus.CLOSED;

        DLCLinkCompatible(dlc.protocolContract).postCloseDLCHandler(
            _uuid,
            _btcTxId
        );

        emit PostCloseDLC(_uuid, _btcTxId, msg.sender);
    }

    ////////////////////////////////////////////////////////////////
    //                      VIEW FUNCTIONS                        //
    ////////////////////////////////////////////////////////////////

    function getDLC(
        bytes32 _uuid
    ) external view override returns (DLCLink.DLC memory) {
        DLCLink.DLC memory _dlc = dlcs[dlcIDsByUUID[_uuid]];
        if (_dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (_dlc.uuid != _uuid) revert DLCNotFound();
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

    function setThreshold(uint16 _newThreshold) external onlyAdmin {
        _threshold = _newThreshold;
    }

    function addApprovedSigner(address _signer) external onlyAdmin {
        _approvedSigners[_signer] = true;
    }

    function removeApprovedSigner(address _signer) external onlyAdmin {
        _approvedSigners[_signer] = false;
    }
}
