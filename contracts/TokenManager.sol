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
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IDLCManager.sol";
import "./DLCLinkCompatible.sol";
import "./DLCBTC.sol";
import "./DLCLinkLibrary.sol";
import "./DLCManager.sol";

/**
 * @author  DLC.Link 2024
 * @title   TokenManager
 * @notice  This contract is responsible for minting and burning dlcBTC tokens
 * It interacts with the DLCManager contract to handle DLCs
 * When a DLC is funded, the DLCManager contract will call setStatusFunded(),
 * which in turn will mint the tokens to the user.
 * @dev     This contract is the owner of the dlcBTC contract
 * @dev     It is upgradable through the OpenZeppelin proxy pattern
 * @dev     Launched with Whitelisted useraddresses enabled first
 * @dev     It is governed by the DLC_ADMIN_ROLE, a multisig wallet
 * @custom:contact robert@dlc.link
 * @custom:website https://www.dlc.link
 */
contract TokenManager is
    Initializable,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable,
    DLCLinkCompatible
{
    using SafeERC20 for DLCBTC;
    using DLCLink for DLCLink.DLC;

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
    DLCManager public dlcManager; // DLCManager contract
    string public btcFeeRecipient; // BTC address to send fees to
    address public feeRecipient; // address to send fees to
    uint256 public minimumDeposit; // in sats
    uint256 public maximumDeposit; // in sats
    uint256 public btcMintFeeRate; // in basis points (100 = 1%) -- BTC
    uint256 public btcRedeemFeeRate; // in basis points (100 = 1%) -- BTC
    bool public whitelistingEnabled;

    mapping(address => bytes32[]) public userVaults;
    mapping(address => bool) private _whitelistedAddresses;
    uint256[50] __gap;

    ////////////////////////////////////////////////////////////////
    //                           ERRORS                           //
    ////////////////////////////////////////////////////////////////

    error NotDLCAdmin();
    error NotDLCManagerContract();
    error NotPauser();
    error NotOwner();
    error NotWhitelisted();
    error DepositTooSmall(uint256 deposit, uint256 minimumDeposit);
    error DepositTooLarge(uint256 deposit, uint256 maximumDeposit);
    error InsufficientTokenBalance(uint256 balance, uint256 amount);

    error FeeRateOutOfBounds(uint256 feeRate);

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

    modifier onlyWhitelisted() {
        if (whitelistingEnabled && !_whitelistedAddresses[msg.sender])
            revert NotWhitelisted();
        _;
    }

    function initialize(
        address adminAddress,
        address dlcManagerAddress,
        DLCBTC tokenContract,
        string memory btcFeeRecipientToSet
    ) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, adminAddress);
        _grantRole(DLC_ADMIN_ROLE, adminAddress);
        _grantRole(DLC_MANAGER_ROLE, dlcManagerAddress);
        _grantRole(PAUSER_ROLE, adminAddress);
        dlcManager = DLCManager(dlcManagerAddress);
        dlcBTC = tokenContract;
        minimumDeposit = 1e6; // 0.01 BTC
        maximumDeposit = 1e8; // 1 BTC
        whitelistingEnabled = true;
        btcMintFeeRate = 100; // 1% BTC fee for now
        btcRedeemFeeRate = 100; // 1% BTC fee for now
        btcFeeRecipient = btcFeeRecipientToSet;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    ////////////////////////////////////////////////////////////////
    //                          EVENTS                            //
    ////////////////////////////////////////////////////////////////

    event SetupVault(bytes32 dlcUUID, uint256 btcDeposit, address owner);

    event CloseVault(bytes32 dlcUUID, address owner);

    event Mint(address to, uint256 amount);

    event Burn(address from, uint256 amount);

    event SetStatusFunded(bytes32 dlcUUID, string btcTxId, address owner);

    event PostCloseDLCHandler(bytes32 dlcUUID, string btcTxId, address owner);

    event WhitelistAddress(address addressToWhitelist);
    event UnwhitelistAddress(address addressToUnWhitelist);
    event SetMinimumDeposit(uint256 newMinimumDeposit);
    event SetMaximumDeposit(uint256 newMaximumDeposit);
    event SetBtcMintFeeRate(uint256 newBtcMintFeeRate);
    event SetBtcRedeemFeeRate(uint256 newBtcRedeemFeeRate);
    event SetBtcFeeRecipient(string btcFeeRecipient);
    event SetWhitelistingEnabled(bool isWhitelistingEnabled);
    event NewDLCManagerContract(address newDLCManagerAddress);
    event TransferTokenContractOwnership(address newOwner);

    ////////////////////////////////////////////////////////////////
    //                    INTERNAL FUNCTIONS                      //
    ////////////////////////////////////////////////////////////////

    function _mintTokens(address to, uint256 amount) internal {
        dlcBTC.mint(to, amount);
        emit Mint(to, amount);
    }

    function _burnTokens(address from, uint256 amount) internal {
        dlcBTC.burn(from, amount);
        emit Burn(from, amount);
    }

    ////////////////////////////////////////////////////////////////
    //                       MAIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    /**
     * @notice  Creates a new vault for the user
     * @dev     It calls the DLCManager contract to create a new DLC
     * @param   btcDeposit  amount to be locked (in sats)
     * @return  bytes32  uuid of the new vault/DLC
     */
    function setupVault(
        uint256 btcDeposit
    ) external whenNotPaused onlyWhitelisted returns (bytes32) {
        if (btcDeposit < minimumDeposit)
            revert DepositTooSmall(btcDeposit, minimumDeposit);
        if (btcDeposit > maximumDeposit)
            revert DepositTooLarge(btcDeposit, maximumDeposit);

        bytes32 _uuid = dlcManager.createDLC(
            btcDeposit,
            btcFeeRecipient,
            btcMintFeeRate,
            btcRedeemFeeRate
        );

        userVaults[msg.sender].push(_uuid);

        emit SetupVault(_uuid, btcDeposit, msg.sender);

        return _uuid;
    }

    /**
     * @notice  Callback function called by the DLCManager contract when a DLC is funded
     * @dev     It initiates the mint to the user
     * @param   uuid  uuid of the vault/DLC
     */
    function setStatusFunded(
        bytes32 uuid,
        string calldata btcTxId
    ) external override whenNotPaused onlyDLCManagerContract {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);

        _mintTokens(dlc.creator, dlc.valueLocked);
        emit SetStatusFunded(uuid, btcTxId, dlc.creator);
    }

    /**
     * @notice  Burns the tokens and requests the closing of the vault
     * @dev     User must have enough dlcBTC tokens to close the DLC fully
     * @param   uuid  uuid of the vault/DLC
     */
    function closeVault(bytes32 uuid) external whenNotPaused {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        if (dlc.creator != msg.sender) revert NotOwner();

        if (dlc.valueLocked > dlcBTC.balanceOf(dlc.creator))
            revert InsufficientTokenBalance(
                dlcBTC.balanceOf(dlc.creator),
                dlc.valueLocked
            );

        _burnTokens(dlc.creator, dlc.valueLocked);

        dlcManager.closeDLC(uuid);
        emit CloseVault(uuid, msg.sender);
    }

    function postCloseDLCHandler(
        bytes32 uuid,
        string calldata btcTxId
    ) external override whenNotPaused onlyDLCManagerContract {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        emit PostCloseDLCHandler(uuid, btcTxId, dlc.creator);
    }

    ////////////////////////////////////////////////////////////////
    //                      VIEW FUNCTIONS                        //
    ////////////////////////////////////////////////////////////////

    function getVault(bytes32 uuid) public view returns (DLCLink.DLC memory) {
        return dlcManager.getDLC(uuid);
    }

    function getAllVaultUUIDsForAddress(
        address owner
    ) public view returns (bytes32[] memory) {
        return userVaults[owner];
    }

    function getAllVaultsForAddress(
        address owner
    ) public view returns (DLCLink.DLC[] memory) {
        bytes32[] memory uuids = getAllVaultUUIDsForAddress(owner);
        DLCLink.DLC[] memory vaults = new DLCLink.DLC[](uuids.length);
        for (uint256 i = 0; i < uuids.length; i++) {
            vaults[i] = getVault(uuids[i]);
        }
        return vaults;
    }

    ////////////////////////////////////////////////////////////////
    //                      ADMIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    function whitelistAddress(
        address addressToWhitelist
    ) external onlyDLCAdmin {
        _whitelistedAddresses[addressToWhitelist] = true;
        emit WhitelistAddress(addressToWhitelist);
    }

    function unwhitelistAddress(
        address addressToUnWhitelist
    ) external onlyDLCAdmin {
        _whitelistedAddresses[addressToUnWhitelist] = false;
        emit UnwhitelistAddress(addressToUnWhitelist);
    }

    function setMinimumDeposit(
        uint256 newMinimumDeposit
    ) external onlyDLCAdmin {
        minimumDeposit = newMinimumDeposit;
        emit SetMinimumDeposit(newMinimumDeposit);
    }

    function setMaximumDeposit(
        uint256 newMaximumDeposit
    ) external onlyDLCAdmin {
        maximumDeposit = newMaximumDeposit;
        emit SetMaximumDeposit(newMaximumDeposit);
    }

    function setBtcMintFeeRate(
        uint256 newBtcMintFeeRate
    ) external onlyDLCAdmin {
        if (newBtcMintFeeRate > 10000)
            revert FeeRateOutOfBounds(newBtcMintFeeRate);
        btcMintFeeRate = newBtcMintFeeRate;
        emit SetBtcMintFeeRate(newBtcMintFeeRate);
    }

    function setBtcRedeemFeeRate(
        uint256 newBtcRedeemFeeRate
    ) external onlyDLCAdmin {
        btcRedeemFeeRate = newBtcRedeemFeeRate;
        emit SetBtcRedeemFeeRate(newBtcRedeemFeeRate);
    }

    function setBtcFeeRecipient(
        string calldata btcFeeRecipientToSet
    ) external onlyDLCAdmin {
        btcFeeRecipient = btcFeeRecipientToSet;
        emit SetBtcFeeRecipient(btcFeeRecipient);
    }

    function setWhitelistingEnabled(
        bool isWhitelistingEnabled
    ) external onlyDLCAdmin {
        whitelistingEnabled = isWhitelistingEnabled;
        emit SetWhitelistingEnabled(isWhitelistingEnabled);
    }

    function updateDLCManagerContract(
        address newDLCManagerAddress
    ) external onlyDLCAdmin {
        dlcManager = DLCManager(newDLCManagerAddress);
        _grantRole(DLC_MANAGER_ROLE, newDLCManagerAddress);
        emit NewDLCManagerContract(newDLCManagerAddress);
    }

    function transferTokenContractOwnership(
        address newOwner
    ) external onlyDLCAdmin {
        dlcBTC.transferOwnership(newOwner);
        emit TransferTokenContractOwnership(newOwner);
    }

    function pauseContract() external onlyPauser {
        _pause();
    }

    function unpauseContract() external onlyPauser {
        _unpause();
    }
}
