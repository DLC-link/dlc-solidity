// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "../DLCLinkCompatibleV2.sol";
import "../IDLCManagerV2.sol";
// import "./AttestorManager.sol";
import "../DLCLinkLibrary.sol";

contract MockDLCManagerV2 is AccessControl, Pausable, IDLCManagerV2 {
    using DLCLink for DLCLink.DLC;
    using DLCLink for DLCLink.DLCStatus;

    ////////////////////////////////////////////////////////////////
    //                      STATE VARIABLES                       //
    ////////////////////////////////////////////////////////////////

    // bytes32 public constant DLC_ADMIN_ROLE =
    //     0x2bf88000669ee6f7a648a231f4adbc117f5a8e34f980c08420b9b9a9f2640aa1; // keccak256("DLC_ADMIN_ROLE")
    // bytes32 public constant WHITELISTED_CONTRACT =
    //     0xec26500344858148ae6c4dd068dc3bae426095ee44cdb32b94288d883648f619; // keccak256("WHITELISTED_CONTRACT")
    // bytes32 public constant WHITELISTED_WALLET =
    //     0xb9ec2c8072d6792e79a05f449c2577c76c4206da58e44ef66dde03fbe8d28112; // keccak256("WHITELISTED_WALLET")

    // AttestorManager private _attestorManager;
    uint256 private _index = 0;
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
    error DLCStateAlreadySet(DLCLink.DLCStatus status);
    error DLCNotFound();
    error DLCNotReady();
    error DLCNotFunded();
    error DLCNotClosing();

    ////////////////////////////////////////////////////////////////
    //                         MODIFIERS                          //
    ////////////////////////////////////////////////////////////////

    // modifier onlyAdmin() {
    //     if (!hasRole(DLC_ADMIN_ROLE, msg.sender)) revert NotDLCAdmin();
    //     _;
    // }

    // modifier onlyWhiteListedContracts() {
    //     if (!hasRole(WHITELISTED_CONTRACT, msg.sender))
    //         revert ContractNotWhitelisted();
    //     _;
    // }

    // modifier onlyWhitelistedWallet(address _wallet) {
    //     if (!hasRole(WHITELISTED_WALLET, _wallet))
    //         revert WalletNotWhitelisted();
    //     _;
    // }

    // modifier onlyWhitelistedAndConnectedWallet(bytes32 _uuid) {
    //     if (!hasRole(WHITELISTED_WALLET, msg.sender))
    //         revert WalletNotWhitelisted();
    //     if (dlcs[dlcIDsByUUID[_uuid]].protocolWallet != msg.sender)
    //         revert UnathorizedWallet();
    //     _;
    // }

    // modifier onlyCreatorContract(bytes32 _uuid) {
    //     if (dlcs[dlcIDsByUUID[_uuid]].protocolContract != msg.sender)
    //         revert NotCreatorContract();
    //     _;
    // }

    constructor() {
        // Grant the contract deployer the default admin role
        // _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // _setupRole(DLC_ADMIN_ROLE, _adminAddress);
        // _attestorManager = AttestorManager(_attestorManagerAddress);
    }

    ////////////////////////////////////////////////////////////////
    //                          EVENTS                            //
    ////////////////////////////////////////////////////////////////

    event CreateDLC(
        bytes32 uuid,
        string[] attestorList,
        uint256 valueLocked,
        address protocolContract,
        address creator,
        address protocolWallet,
        string eventSource
    );

    event SetStatusFunded(
        bytes32 uuid,
        address creator,
        address protocolWallet,
        address sender,
        string eventSource
    );

    event CloseDLC(
        bytes32 uuid,
        uint256 outcome,
        address creator,
        address protocolWallet,
        address sender,
        string eventSource
    );

    event PostCloseDLC(
        bytes32 uuid,
        uint256 outcome,
        address creator,
        address protocolWallet,
        address sender,
        string btcTxId,
        string eventSource
    );

    ////////////////////////////////////////////////////////////////
    //                    INTERNAL FUNCTIONS                      //
    ////////////////////////////////////////////////////////////////

    function _generateUUID(
        address /*sender*/,
        uint256 /*nonce*/
    ) private view returns (bytes32) {
        return
            bytes32(
                0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967
            );
    }

    ////////////////////////////////////////////////////////////////
    //                       MAIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    // Default value for _attestorCount is 3
    function createDLC(
        address _protocolWallet,
        uint256 _valueLocked
    ) external override whenNotPaused returns (bytes32, string[] memory) {
        return this.createDLC(_protocolWallet, _valueLocked, 3);
    }

    function createDLC(
        address _protocolWallet,
        uint256 _valueLocked,
        uint8 /*_attestorCount*/
    ) external override whenNotPaused returns (bytes32, string[] memory) {
        bytes32 _uuid = _generateUUID(tx.origin, _index);
        string[] memory _attestorList = new string[](3);

        _attestorList[0] = "https://attestor1.com";
        _attestorList[1] = "https://attestor2.com";
        _attestorList[2] = "https://attestor3.com";

        dlcs[_index] = DLCLink.DLC({
            uuid: _uuid,
            attestorList: _attestorList,
            protocolWallet: _protocolWallet,
            protocolContract: msg.sender,
            valueLocked: _valueLocked,
            creator: tx.origin,
            outcome: 0,
            status: DLCLink.DLCStatus.READY,
            fundingTxId: "",
            closingTxId: ""
        });

        emit CreateDLC(
            _uuid,
            _attestorList,
            _valueLocked,
            msg.sender,
            tx.origin,
            _protocolWallet,
            "dlclink:create-dlc:v2"
        );

        dlcIDsByUUID[_uuid] = _index;
        _index++;

        return (_uuid, _attestorList);
    }

    function setStatusFunded(
        bytes32 _uuid,
        string calldata _btcTxId
    ) external whenNotPaused {
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[_uuid]];
        DLCLink.DLCStatus _newStatus = DLCLink.DLCStatus.FUNDED;

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.READY) revert DLCNotReady();
        if (dlc.status == _newStatus) revert DLCStateAlreadySet(_newStatus);

        dlc.fundingTxId = _btcTxId;
        dlc.status = _newStatus;

        DLCLinkCompatibleV2(dlc.protocolContract).setStatusFunded(
            _uuid,
            _btcTxId
        );

        emit SetStatusFunded(
            _uuid,
            dlc.creator,
            dlc.protocolWallet,
            msg.sender,
            "dlclink:set-status-funded:v2"
        );
    }

    function closeDLC(bytes32 _uuid, uint256 _outcome) external whenNotPaused {
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[_uuid]];
        DLCLink.DLCStatus _newStatus = DLCLink.DLCStatus.CLOSING;

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.FUNDED) revert DLCNotFunded();
        if (dlc.status == _newStatus) revert DLCStateAlreadySet(_newStatus);

        dlc.outcome = _outcome;
        dlc.status = _newStatus;

        emit CloseDLC(
            _uuid,
            _outcome,
            dlc.creator,
            dlc.protocolWallet,
            msg.sender,
            "dlclink:close-dlc:v2"
        );
    }

    function postCloseDLC(
        bytes32 _uuid,
        string calldata _btcTxId
    ) external whenNotPaused {
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[_uuid]];
        DLCLink.DLCStatus _newStatus = DLCLink.DLCStatus.CLOSED;

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.CLOSING) revert DLCNotClosing();
        if (dlc.status == _newStatus) revert DLCStateAlreadySet(_newStatus);

        dlc.closingTxId = _btcTxId;
        dlc.status = _newStatus;

        DLCLinkCompatibleV2(dlc.protocolContract).postCloseDLCHandler(
            _uuid,
            _btcTxId
        );

        emit PostCloseDLC(
            _uuid,
            dlc.outcome,
            dlc.creator,
            dlc.protocolWallet,
            msg.sender,
            _btcTxId,
            "dlclink:post-close-dlc:v2"
        );
    }

    ////////////////////////////////////////////////////////////////
    //                      VIEW FUNCTIONS                        //
    ////////////////////////////////////////////////////////////////

    function getDLC(
        bytes32 _uuid
    ) external view override returns (DLCLink.DLC memory) {
        return dlcs[dlcIDsByUUID[_uuid]];
    }

    function getDLCByIndex(
        uint256 index
    ) external view returns (DLCLink.DLC memory) {
        return dlcs[index];
    }

    // function getAllAttestors() public view returns (string[] memory) {
    //     return _attestorManager.getAllAttestors();
    // }

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

    // function pauseContract() external onlyAdmin {
    //     _pause();
    // }

    // function unpauseContract() external onlyAdmin {
    //     _unpause();
    // }
}
