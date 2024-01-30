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
import "./DLCLinkCompatible.sol";
import "./IDLCManager.sol";
import "./DLCLinkLibrary.sol";

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
    bytes32 public constant WHITELISTED_WALLET =
        0xb9ec2c8072d6792e79a05f449c2577c76c4206da58e44ef66dde03fbe8d28112; // keccak256("WHITELISTED_WALLET")

    uint256 private _index;
    mapping(uint256 => DLCLink.DLC) public dlcs;
    mapping(bytes32 => uint256) public dlcIDsByUUID;

    ////////////////////////////////////////////////////////////////
    //                           ERRORS                           //
    ////////////////////////////////////////////////////////////////

    error NotDLCAdmin();
    error ContractNotWhitelisted();
    error WalletNotWhitelisted();
    error UnathorizedWallet();
    error NotCreatorContract();
    error WrongDLCState();
    error DLCNotFound();
    error DLCNotReady();
    error DLCNotFunded();
    error DLCNotClosing();

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

    modifier onlyWhitelistedWallet(address _wallet) {
        if (!hasRole(WHITELISTED_WALLET, _wallet))
            revert WalletNotWhitelisted();
        _;
    }

    modifier onlyWhitelistedAndConnectedWallet(bytes32 _uuid) {
        if (!hasRole(WHITELISTED_WALLET, msg.sender))
            revert WalletNotWhitelisted();
        if (dlcs[dlcIDsByUUID[_uuid]].protocolWallet != msg.sender)
            revert UnathorizedWallet();
        _;
    }

    modifier onlyCreatorContract(bytes32 _uuid) {
        if (dlcs[dlcIDsByUUID[_uuid]].protocolContract != msg.sender)
            revert NotCreatorContract();
        _;
    }

    function initialize(address _adminAddress) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, _adminAddress);
        _grantRole(DLC_ADMIN_ROLE, _adminAddress);
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
        address protocolWallet,
        uint256 timestamp
    );

    event SetStatusFunded(
        bytes32 uuid,
        string btcTxId,
        address protocolWallet,
        address sender
    );

    event CloseDLC(
        bytes32 uuid,
        uint256 outcome,
        address protocolWallet,
        address sender
    );

    event PostCloseDLC(
        bytes32 uuid,
        uint256 outcome,
        string btcTxId,
        address protocolWallet,
        address sender
    );

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

    ////////////////////////////////////////////////////////////////
    //                       MAIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    /**
     * @notice  Triggers the creation of an Announcement in the Attestor Layer.
     * @dev     Call this function from a whitelisted protocol-contract.
     * @param   _protocolWallet  A router-wallet address, that will be authorized to update this DLC.
     * @param   _valueLocked  Value to be locked in the DLC , in Satoshis.
     * @param   _refundDelay  Delay in seconds before the creator can claim a refund. Set 0 to disable.
     * @param   _btcFeeRecipient  Bitcoin address that will receive the DLC fees.
     * @param   _btcFeeBasisPoints  Basis points of the valueLocked that will be sent to the _btcFeeRecipient.
     * @return  bytes32  A generated UUID.
     */
    function createDLC(
        address _protocolWallet,
        uint256 _valueLocked,
        uint256 _refundDelay,
        string calldata _btcFeeRecipient,
        uint256 _btcFeeBasisPoints
    )
        external
        override
        onlyWhiteListedContracts
        onlyWhitelistedWallet(_protocolWallet)
        whenNotPaused
        returns (bytes32)
    {
        bytes32 _uuid = _generateUUID(tx.origin, _index);

        dlcs[_index] = DLCLink.DLC({
            uuid: _uuid,
            protocolWallet: _protocolWallet,
            protocolContract: msg.sender,
            valueLocked: _valueLocked,
            refundDelay: _refundDelay,
            timestamp: block.timestamp,
            creator: tx.origin,
            outcome: 0,
            status: DLCLink.DLCStatus.READY,
            fundingTxId: "",
            closingTxId: "",
            btcFeeRecipient: _btcFeeRecipient,
            btcFeeBasisPoints: _btcFeeBasisPoints
        });

        emit CreateDLC(
            _uuid,
            _valueLocked,
            msg.sender,
            tx.origin,
            _protocolWallet,
            block.timestamp
        );

        dlcIDsByUUID[_uuid] = _index;
        _index++;

        return _uuid;
    }

    /**
     * @notice  Confirms that a DLC was 'funded' on the Bitcoin blockchain.
     * @dev     Called by the connected router-wallet.
     * @param   _uuid  UUID of the DLC.
     * @param   _btcTxId  DLC Funding Transaction ID on the Bitcoin blockchain.
     */
    function setStatusFunded(
        bytes32 _uuid,
        string calldata _btcTxId
    ) external onlyWhitelistedAndConnectedWallet(_uuid) whenNotPaused {
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[_uuid]];
        DLCLink.DLCStatus _newStatus = DLCLink.DLCStatus.FUNDED;

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.READY) revert DLCNotReady();

        dlc.fundingTxId = _btcTxId;
        dlc.status = _newStatus;

        DLCLinkCompatible(dlc.protocolContract).setStatusFunded(
            _uuid,
            _btcTxId
        );

        emit SetStatusFunded(_uuid, _btcTxId, dlc.protocolWallet, msg.sender);
    }

    /**
     * @notice  Triggers the creation of an Attestation.
     * @dev     Attestors will sign the provided _outcome.
     * There are several ways to design the outcome values, depending on the use case.
     * See the DLC.Link documentation for more details.
     * @param   _uuid  UUID of the DLC.
     * @param   _outcome  Outcome of the DLC, generally a number between 0-10000. (10000 = 100%)
     */
    function closeDLC(
        bytes32 _uuid,
        uint256 _outcome
    ) external onlyCreatorContract(_uuid) whenNotPaused {
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[_uuid]];
        DLCLink.DLCStatus _newStatus = DLCLink.DLCStatus.CLOSING;

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.FUNDED) revert DLCNotFunded();

        dlc.outcome = _outcome;
        dlc.status = _newStatus;

        emit CloseDLC(_uuid, _outcome, dlc.protocolWallet, msg.sender);
    }

    /**
     * @notice  Triggered after a closing Tx has been confirmed Bitcoin.
     * @dev     Similarly to setStatusFunded, this is called by a router-wallet.
     * @param   _uuid  UUID of the DLC.
     * @param   _btcTxId  Closing Bitcoin Tx id.
     */
    function postCloseDLC(
        bytes32 _uuid,
        string calldata _btcTxId
    ) external onlyWhitelistedAndConnectedWallet(_uuid) whenNotPaused {
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[_uuid]];
        DLCLink.DLCStatus _newStatus = DLCLink.DLCStatus.CLOSED;

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.CLOSING) revert DLCNotClosing();

        dlc.closingTxId = _btcTxId;
        dlc.status = _newStatus;

        DLCLinkCompatible(dlc.protocolContract).postCloseDLCHandler(
            _uuid,
            _btcTxId
        );

        emit PostCloseDLC(
            _uuid,
            dlc.outcome,
            _btcTxId,
            dlc.protocolWallet,
            msg.sender
        );
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
}
