// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

import "@openzeppelin/contracts-upgradeable/access/AccessControlDefaultAdminRulesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IDLCManagerV2.sol";
import "./DLCLinkCompatibleV2.sol";
import "./DLCBTC.sol";

contract TokenManager is
    Initializable,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable,
    DLCLinkCompatibleV2
{
    using SafeERC20 for DLCBTC;

    enum VaultStatus {
        Ready,
        Funded,
        PreClosed,
        Closed
    }

    struct Vault {
        bytes32 uuid;
        string[] attestorList;
        VaultStatus status;
        uint256 btcDeposit; // btc deposit in sats
        address owner; // the account owning this vault
        string fundingTxId;
        string closingTxId;
    }

    ////////////////////////////////////////////////////////////////
    //                      STATE VARIABLES                       //
    ////////////////////////////////////////////////////////////////

    // Hardcoded constants to save gas
    bytes32 public constant DLC_ADMIN_ROLE =
        0x2bf88000669ee6f7a648a231f4adbc117f5a8e34f980c08420b9b9a9f2640aa1; // keccak256("DLC_ADMIN_ROLE")
    bytes32 public constant DLC_MANAGER_ROLE =
        0xc0e7a011e039a863dc1cb785a717324b6601de5d97f6687eae961f972d1472fd; // keccak256("DLC_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE =
        0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a; // keccak256("PAUSER_ROLE");

    DLCBTC public dlcBTC; // dlcBTC contract
    IDLCManagerV2 public dlcManager; // DLCManager contract
    address public protocolWalletAddress; // router-wallet address
    uint256 public minimumDeposit; // in sats
    uint256 public vaultCount;

    mapping(uint256 => Vault) public vaults;
    mapping(address => uint256) public vaultsPerAddress;
    mapping(bytes32 => uint256) public vaultIDsByUUID;

    ////////////////////////////////////////////////////////////////
    //                           ERRORS                           //
    ////////////////////////////////////////////////////////////////

    error NotDLCAdmin();
    error NotDLCManagerContract();
    error NotPauser();
    error NotOwner();
    error DepositTooSmall(uint256 deposit, uint256 minimumDeposit);
    error WrongVaultState();
    error VaultStateAlreadySet(VaultStatus status);
    error VaultNotFound();
    error VaultNotReady();
    error VaultNotFunded();
    error VaultNotPreClosed();

    ////////////////////////////////////////////////////////////////
    //                         MODIFIERS                          //
    ////////////////////////////////////////////////////////////////

    modifier onlyDLCAdmin() {
        if (!hasRole(DLC_ADMIN_ROLE, msg.sender)) revert NotDLCAdmin();
        _;
    }

    modifier onlyDLCManagerContract() {
        if (!hasRole(DLC_MANAGER_ROLE, msg.sender))
            revert NotDLCManagerContract();
        _;
    }

    modifier onlyPauser() {
        if (!hasRole(PAUSER_ROLE, msg.sender)) revert NotPauser();
        _;
    }

    modifier onlyOwner(bytes32 uuid) {
        if (vaults[vaultIDsByUUID[uuid]].owner != msg.sender) revert NotOwner();
        _;
    }

    function initialize(
        address _dlcManagerAddress,
        DLCBTC _tokenContract,
        address _protocolWallet
    ) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, msg.sender);
        _grantRole(DLC_MANAGER_ROLE, _dlcManagerAddress);
        _grantRole(PAUSER_ROLE, msg.sender);
        dlcManager = IDLCManagerV2(_dlcManagerAddress);
        dlcBTC = _tokenContract;
        protocolWalletAddress = _protocolWallet;
        minimumDeposit = 1000; // 0.00001 BTC
        vaultCount = 0;
    }

    constructor() {
        _disableInitializers();
    }

    ////////////////////////////////////////////////////////////////
    //                          EVENTS                            //
    ////////////////////////////////////////////////////////////////

    event SetupVault(
        bytes32 dlcUUID,
        uint256 btcDeposit,
        string[] attestorList,
        address owner
    );

    event StatusUpdate(bytes32 dlcUUID, VaultStatus newStatus);

    ////////////////////////////////////////////////////////////////
    //                    INTERNAL FUNCTIONS                      //
    ////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////
    //                       MAIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    // NOTE: we could set up an overload with a preset number of attestors
    // function setupVault(
    //     uint256 btcDeposit
    // ) external whenNotPaused returns (bytes32) {
    //     return this.setupVault(btcDeposit, 1);
    // }

    function setupVault(
        uint256 btcDeposit,
        uint8 attestorCount
    ) external whenNotPaused returns (bytes32) {
        if (btcDeposit < minimumDeposit)
            revert DepositTooSmall(btcDeposit, minimumDeposit);

        (bytes32 _uuid, string[] memory attestorList) = dlcManager.createDLC(
            protocolWalletAddress,
            attestorCount
        );

        vaults[vaultCount] = Vault({
            uuid: _uuid,
            attestorList: attestorList,
            status: VaultStatus.Ready,
            btcDeposit: btcDeposit,
            owner: msg.sender,
            fundingTxId: "",
            closingTxId: ""
        });

        vaultIDsByUUID[_uuid] = vaultCount;
        vaultsPerAddress[msg.sender]++;
        vaultCount++;

        emit SetupVault(_uuid, btcDeposit, attestorList, msg.sender);
        emit StatusUpdate(_uuid, VaultStatus.Ready);

        return _uuid;
    }

    function setStatusFunded(
        bytes32 uuid,
        string calldata btcTxId
    ) external override whenNotPaused onlyDLCManagerContract {
        Vault storage vault = vaults[vaultIDsByUUID[uuid]];
        VaultStatus _newStatus = VaultStatus.Funded;
        if (vault.uuid == bytes32(0)) revert VaultNotFound();
        if (vault.status != VaultStatus.Ready) revert VaultNotReady();
        if (vault.status == _newStatus) revert VaultStateAlreadySet(_newStatus);

        vault.fundingTxId = btcTxId;
        vault.status = _newStatus;
        emit StatusUpdate(uuid, _newStatus);

        // TODO:
        // - we want to store the txids in an easily queryable mapping/two
        // - we want to mint the tokens to the owner, preferably in a composable way
    }

    function closeVault(bytes32 uuid) external whenNotPaused onlyOwner(uuid) {
        Vault storage vault = vaults[vaultIDsByUUID[uuid]];
        VaultStatus _newStatus = VaultStatus.PreClosed;
        if (vault.uuid == bytes32(0)) revert VaultNotFound();
        // NOTE: ? should we allow closing a vault that is not funded?
        if (vault.status != VaultStatus.Funded) revert VaultNotFunded();
        if (vault.status == _newStatus) revert VaultStateAlreadySet(_newStatus);

        vault.status = _newStatus;
        emit StatusUpdate(uuid, _newStatus);

        // TODO: add outcome computation in a composable way
        // burn the tokens
        // call the dlcManager to close the dlc

        // dlcManager.closeDLC(uuid, outcome);
    }

    function postCloseDLCHandler(
        bytes32 uuid,
        string calldata btcTxId
    ) external override whenNotPaused onlyDLCManagerContract {
        Vault storage vault = vaults[vaultIDsByUUID[uuid]];
        VaultStatus _newStatus = VaultStatus.Closed;
        if (vault.uuid == bytes32(0)) revert VaultNotFound();
        if (vault.status != VaultStatus.PreClosed) revert VaultNotPreClosed();
        if (vault.status == _newStatus) revert VaultStateAlreadySet(_newStatus);

        vault.closingTxId = btcTxId;
        vault.status = _newStatus;
        emit StatusUpdate(uuid, _newStatus);

        // TODO:
        // - we want to invalidate the txid
    }

    ////////////////////////////////////////////////////////////////
    //                      VIEW FUNCTIONS                        //
    ////////////////////////////////////////////////////////////////

    function getVault(bytes32 _uuid) public view returns (Vault memory) {
        return vaults[vaultIDsByUUID[_uuid]];
    }

    function getAllVaultsForAddress(
        address _address
    ) public view returns (Vault[] memory) {
        Vault[] memory _vaults = new Vault[](vaultsPerAddress[_address]);
        uint256 _vaultCount = 0;
        for (uint256 i = 0; i < vaultCount; i++) {
            if (vaults[i].owner == _address) {
                _vaults[_vaultCount] = vaults[i];
                _vaultCount++;
            }
        }
        return _vaults;
    }

    ////////////////////////////////////////////////////////////////
    //                      ADMIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    function setProtocolWallet(address _protocolWallet) external onlyDLCAdmin {
        protocolWalletAddress = _protocolWallet;
    }

    function setMinimumDeposit(uint256 _minimumDeposit) external onlyDLCAdmin {
        minimumDeposit = _minimumDeposit;
    }

    function updateDLCManagerContract(
        address _dlcManagerAddress
    ) external onlyDLCAdmin {
        dlcManager = IDLCManagerV2(_dlcManagerAddress);
        _grantRole(DLC_MANAGER_ROLE, _dlcManagerAddress);
    }

    function transferTokenContractOwnership(
        address newOwner
    ) external onlyDLCAdmin {
        dlcBTC.transferOwnership(newOwner);
    }

    function pauseContract() external onlyPauser {
        _pause();
    }

    function unpauseContract() external onlyPauser {
        _unpause();
    }
}
