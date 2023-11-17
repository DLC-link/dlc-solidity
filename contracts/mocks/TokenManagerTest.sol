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
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../IDLCManager.sol";
import "../DLCLinkCompatible.sol";
import "../DLCBTC.sol";
import "../DLCLinkLibrary.sol";

contract TokenManagerV2Test is
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
    IDLCManager public dlcManager; // DLCManager contract
    address public routerWalletAddress; // router-wallet address
    uint256 public minimumDeposit; // in sats
    uint256 public maximumDeposit; // in sats
    uint256 public mintFeeRate; // in basis points (10000 = 100%) -- dlcBTC
    uint256 public outcomeFee; // in basis points (10000 = 100%) -- BTC
    bool public whitelistingEnabled;

    mapping(address => bytes32[]) public userVaults;
    mapping(address => bool) private _whitelistedAddresses;

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
        address _adminAddress,
        address _dlcManagerAddress,
        DLCBTC _tokenContract,
        address _routerWalletAddress
    ) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, _adminAddress);
        _grantRole(DLC_ADMIN_ROLE, _adminAddress);
        _grantRole(DLC_MANAGER_ROLE, _dlcManagerAddress);
        _grantRole(PAUSER_ROLE, _adminAddress);
        dlcManager = IDLCManager(_dlcManagerAddress);
        dlcBTC = _tokenContract;
        routerWalletAddress = _routerWalletAddress;
        // NOTE:
        minimumDeposit = 1000; // 0.00001 BTC
        maximumDeposit = 1000000000; // 10 BTC
        mintFeeRate = 0; // 0% dlcBTC fee for now
        outcomeFee = 0; // 0% BTC bias for now
        whitelistingEnabled = true;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
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

    event Mint(address to, uint256 amount);

    event Burn(address from, uint256 amount);

    ////////////////////////////////////////////////////////////////
    //                    INTERNAL FUNCTIONS                      //
    ////////////////////////////////////////////////////////////////

    // _amount is in sats
    // mintFeeRate is in basis points, e.g. 100 = 1% fee
    function _getFeeAdjustedAmount(
        uint256 _amount
    ) internal view returns (uint256) {
        return (_amount * (10000 - mintFeeRate)) / 10000;
    }

    function _calculateOutcome() internal view returns (uint256) {
        return 10000 - outcomeFee;
    }

    function _mintTokens(address _to, uint256 _amount) internal {
        dlcBTC.mint(_to, _amount);
        emit Mint(_to, _amount);
    }

    function _burnTokens(address _from, uint256 _amount) internal {
        dlcBTC.burn(_from, _amount);
        emit Burn(_from, _amount);
    }

    ////////////////////////////////////////////////////////////////
    //                       MAIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    function setupVault(
        uint256 btcDeposit
    ) external whenNotPaused onlyWhitelisted returns (bytes32) {
        if (btcDeposit < minimumDeposit)
            revert DepositTooSmall(btcDeposit, minimumDeposit);
        if (btcDeposit > maximumDeposit)
            revert DepositTooLarge(btcDeposit, maximumDeposit);

        (bytes32 _uuid, string[] memory attestorList) = dlcManager.createDLC(
            routerWalletAddress,
            btcDeposit
        );

        userVaults[msg.sender].push(_uuid);

        emit SetupVault(_uuid, btcDeposit, attestorList, msg.sender);

        return _uuid;
    }

    function setStatusFunded(
        bytes32 uuid,
        string calldata /*btcTxId*/
    ) external override whenNotPaused onlyDLCManagerContract {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);

        _mintTokens(dlc.creator, _getFeeAdjustedAmount(dlc.valueLocked));
    }

    function closeVault(bytes32 uuid) external whenNotPaused {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        if (dlc.creator != msg.sender) revert NotOwner();

        if (dlc.valueLocked > dlcBTC.balanceOf(dlc.creator))
            revert InsufficientTokenBalance(
                dlcBTC.balanceOf(dlc.creator),
                dlc.valueLocked
            );

        _burnTokens(dlc.creator, dlc.valueLocked);

        dlcManager.closeDLC(uuid, _calculateOutcome());
    }

    function postCloseDLCHandler(
        bytes32 uuid,
        string calldata btcTxId
    ) external override whenNotPaused onlyDLCManagerContract {}

    ////////////////////////////////////////////////////////////////
    //                      VIEW FUNCTIONS                        //
    ////////////////////////////////////////////////////////////////

    function getVault(bytes32 _uuid) public view returns (DLCLink.DLC memory) {
        return dlcManager.getDLC(_uuid);
    }

    function getAllVaultUUIDsForAddress(
        address _address
    ) public view returns (bytes32[] memory) {
        return userVaults[_address];
    }

    function previewFeeAdjustedAmount(
        uint256 _amount
    ) external view returns (uint256) {
        return _getFeeAdjustedAmount(_amount);
    }

    function newTestFunction() external pure returns (uint256) {
        return 1;
    }

    ////////////////////////////////////////////////////////////////
    //                      ADMIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    function whitelistAddress(address _address) external onlyDLCAdmin {
        _whitelistedAddresses[_address] = true;
    }

    function setRouterWallet(address _routerWallet) external onlyDLCAdmin {
        routerWalletAddress = _routerWallet;
    }

    function setMinimumDeposit(uint256 _minimumDeposit) external onlyDLCAdmin {
        minimumDeposit = _minimumDeposit;
    }

    function setMaximumDeposit(uint256 _maximumDeposit) external onlyDLCAdmin {
        maximumDeposit = _maximumDeposit;
    }

    function setMintFeeRate(uint256 _mintFeeRate) external onlyDLCAdmin {
        mintFeeRate = _mintFeeRate;
    }

    function setOutcomeFee(uint256 _outcomeFee) external onlyDLCAdmin {
        outcomeFee = _outcomeFee;
    }

    function setWhitelistingEnabled(
        bool _whitelistingEnabled
    ) external onlyDLCAdmin {
        whitelistingEnabled = _whitelistingEnabled;
    }

    function updateDLCManagerContract(
        address _dlcManagerAddress
    ) external onlyDLCAdmin {
        dlcManager = IDLCManager(_dlcManagerAddress);
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
