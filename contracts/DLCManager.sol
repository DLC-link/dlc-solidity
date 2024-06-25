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
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./DLCLinkLibrary.sol";
import "./DLCBTC.sol";

/**
 * @author  DLC.Link 2024
 * @title   DLCManager
 * @dev     This is the contract the Attestor Layer listens to.
 * @dev     It is upgradable through the OpenZeppelin proxy pattern
 * @notice  DLCManager is the main contract of the DLC.Link protocol.
 * @custom:contact eng@dlc.link
 * @custom:website https://www.dlc.link
 */
contract DLCManager is
    Initializable,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable
{
    using DLCLink for DLCLink.DLC;
    using DLCLink for DLCLink.DLCStatus;
    using SafeERC20 for DLCBTC;

    ////////////////////////////////////////////////////////////////
    //                      STATE VARIABLES                       //
    ////////////////////////////////////////////////////////////////

    bytes32 public constant DLC_ADMIN_ROLE =
        0x2bf88000669ee6f7a648a231f4adbc117f5a8e34f980c08420b9b9a9f2640aa1; // keccak256("DLC_ADMIN_ROLE")
    bytes32 public constant WHITELISTED_CONTRACT =
        0xec26500344858148ae6c4dd068dc3bae426095ee44cdb32b94288d883648f619; // keccak256("WHITELISTED_CONTRACT")
    bytes32 public constant APPROVED_SIGNER =
        0xc726b34d4e524d7255dc7e36b5dfca6bd2dcd2891ae8c75d511a7e82da8696e5; // keccak256("APPROVED_SIGNER")

    uint256 private _index;
    mapping(uint256 => DLCLink.DLC) public dlcs;
    mapping(bytes32 => uint256) public dlcIDsByUUID;

    uint16 private _minimumThreshold;
    uint16 private _threshold;
    uint16 private _signerCount;
    bytes32 public tssCommitment;
    string public attestorGroupPubKey;

    DLCBTC public dlcBTC; // dlcBTC contract
    string public btcFeeRecipient; // BTC address to send fees to
    uint256 public minimumDeposit; // in sats
    uint256 public maximumDeposit; // in sats
    uint256 public btcMintFeeRate; // in basis points (100 = 1%) -- BTC
    uint256 public btcRedeemFeeRate; // in basis points (100 = 1%) -- BTC
    bool public whitelistingEnabled;

    mapping(address => bytes32[]) public userVaults;
    mapping(address => bool) private _whitelistedAddresses;
    uint256[41] __gap;

    ////////////////////////////////////////////////////////////////
    //                           ERRORS                           //
    ////////////////////////////////////////////////////////////////

    error NotDLCAdmin();
    error IncompatibleRoles();
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

    error InvalidRange();
    error NotOwner();
    error NotWhitelisted();
    error DepositTooSmall(uint256 deposit, uint256 minimumDeposit);
    error DepositTooLarge(uint256 deposit, uint256 maximumDeposit);
    error InsufficientTokenBalance(uint256 balance, uint256 amount);
    error FeeRateOutOfBounds(uint256 feeRate);

    ////////////////////////////////////////////////////////////////
    //                         MODIFIERS                          //
    ////////////////////////////////////////////////////////////////

    modifier onlyAdmin() {
        if (!hasRole(DLC_ADMIN_ROLE, msg.sender)) revert NotDLCAdmin();
        _;
    }

    modifier onlyApprovedSigners() {
        if (!hasRole(APPROVED_SIGNER, msg.sender)) revert Unauthorized();
        _;
    }

    modifier onlyWhitelisted() {
        if (whitelistingEnabled && !_whitelistedAddresses[msg.sender])
            revert NotWhitelisted();
        _;
    }

    function initialize(
        address defaultAdmin,
        address dlcAdminRole,
        uint16 threshold,
        DLCBTC tokenContract,
        string memory btcFeeRecipientToSet
    ) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, defaultAdmin);
        _grantRole(DLC_ADMIN_ROLE, dlcAdminRole);
        _minimumThreshold = 2;
        if (threshold < _minimumThreshold)
            revert ThresholdTooLow(_minimumThreshold);
        _threshold = threshold;
        _index = 0;
        tssCommitment = 0x0;
        dlcBTC = tokenContract;
        minimumDeposit = 1e6; // 0.01 BTC
        maximumDeposit = 5e8; // 5 BTC
        whitelistingEnabled = true;
        btcMintFeeRate = 12; // 0.12% BTC fee for now
        btcRedeemFeeRate = 15; // 0.15% BTC fee for now
        btcFeeRecipient = btcFeeRecipientToSet;
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

    event Mint(address to, uint256 amount);

    event Burn(address from, uint256 amount);

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

    function _generateUUID(
        address sender,
        uint256 nonce
    ) private view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    sender,
                    nonce,
                    blockhash(block.number - 1),
                    block.chainid
                )
            );
    }

    /**
     * @notice  Checks the 'signatures' of Attestors for a given 'message'.
     * @dev     Recalculates the hash to make sure the signatures are for the same message.
     * @dev     Uses OpenZeppelin's ECDSA library to recover the public keys from the signatures.
     * @dev     Signatures must be unique.
     * @param   message  Original message that was signed.
     * @param   signatures  Byte array of at least 'threshold' number of signatures.
     */
    function _attestorMultisigIsValid(
        bytes memory message,
        bytes[] memory signatures
    ) internal view {
        if (signatures.length < _threshold) revert NotEnoughSignatures();

        bytes32 prefixedMessageHash = ECDSAUpgradeable.toEthSignedMessageHash(
            keccak256(message)
        );

        if (_hasDuplicates(signatures)) revert DuplicateSignature();

        for (uint256 i = 0; i < signatures.length; i++) {
            address attestorPubKey = ECDSAUpgradeable.recover(
                prefixedMessageHash,
                signatures[i]
            );
            if (!hasRole(APPROVED_SIGNER, attestorPubKey))
                revert InvalidSigner();
        }
    }

    /**
     * @notice  Checks for duplicate values in an array.
     * @dev     Used to check for duplicate signatures.
     * @param   signatures  Array of signatures.
     * @return  bool  True if there are duplicates, false otherwise.
     */
    function _hasDuplicates(
        bytes[] memory signatures
    ) internal pure returns (bool) {
        for (uint i = 0; i < signatures.length - 1; i++) {
            for (uint j = i + 1; j < signatures.length; j++) {
                if (keccak256(signatures[i]) == keccak256(signatures[j])) {
                    return true;
                }
            }
        }
        return false;
    }

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

        bytes32 _uuid = _generateUUID(tx.origin, _index);

        dlcs[_index] = DLCLink.DLC({
            uuid: _uuid,
            protocolContract: msg.sender,
            valueLocked: btcDeposit,
            timestamp: block.timestamp,
            creator: tx.origin,
            status: DLCLink.DLCStatus.READY,
            fundingTxId: "",
            closingTxId: "",
            btcFeeRecipient: btcFeeRecipient,
            btcMintFeeBasisPoints: btcMintFeeRate,
            btcRedeemFeeBasisPoints: btcRedeemFeeRate,
            taprootPubKey: ""
        });

        emit CreateDLC(
            _uuid,
            btcDeposit,
            msg.sender,
            tx.origin,
            block.timestamp
        );

        dlcIDsByUUID[_uuid] = _index;
        userVaults[msg.sender].push(_uuid);
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
        bytes[] calldata signatures,
        string calldata taprootPubKey
    ) external whenNotPaused onlyApprovedSigners {
        _attestorMultisigIsValid(
            abi.encode(uuid, btcTxId, "set-status-funded"),
            signatures
        );
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[uuid]];

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.READY) revert DLCNotReady();

        dlc.fundingTxId = btcTxId;
        dlc.status = DLCLink.DLCStatus.FUNDED;
        dlc.taprootPubKey = taprootPubKey;

        _mintTokens(dlc.creator, dlc.valueLocked);

        emit SetStatusFunded(uuid, btcTxId, msg.sender);
    }

    /**
     * @notice  Triggers the creation of an Attestation.
     * @param   uuid  UUID of the DLC.
     */
    function closeVault(bytes32 uuid) external whenNotPaused {
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[uuid]];
        if (dlc.creator != msg.sender) revert NotOwner();

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.FUNDED) revert DLCNotFunded();

        if (dlc.valueLocked > dlcBTC.balanceOf(dlc.creator))
            revert InsufficientTokenBalance(
                dlcBTC.balanceOf(dlc.creator),
                dlc.valueLocked
            );

        dlc.status = DLCLink.DLCStatus.CLOSING;

        _burnTokens(dlc.creator, dlc.valueLocked);

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
        _attestorMultisigIsValid(
            abi.encode(uuid, btcTxId, "post-close-dlc"),
            signatures
        );
        DLCLink.DLC storage dlc = dlcs[dlcIDsByUUID[uuid]];

        if (dlc.uuid == bytes32(0)) revert DLCNotFound();
        if (dlc.status != DLCLink.DLCStatus.CLOSING) revert DLCNotClosing();

        dlc.closingTxId = btcTxId;
        dlc.status = DLCLink.DLCStatus.CLOSED;

        emit PostCloseDLC(uuid, btcTxId, msg.sender);
    }

    ////////////////////////////////////////////////////////////////
    //                      VIEW FUNCTIONS                        //
    ////////////////////////////////////////////////////////////////

    function getDLC(bytes32 uuid) external view returns (DLCLink.DLC memory) {
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

    /**
     * @notice  Fetch DLCs, paginated.
     * @param   startIndex  index to start from.
     * @param   endIndex  end index (not inclusive).
     * @return  DLCLink.DLC[]  list of DLCs.
     */
    function getAllDLCs(
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (DLCLink.DLC[] memory) {
        if (startIndex >= endIndex) revert InvalidRange();
        if (endIndex > _index) endIndex = _index;

        DLCLink.DLC[] memory dlcSubset = new DLCLink.DLC[](
            endIndex - startIndex
        );

        for (uint256 i = startIndex; i < endIndex; i++) {
            dlcSubset[i - startIndex] = dlcs[i];
        }

        return dlcSubset;
    }

    function getVault(bytes32 uuid) public view returns (DLCLink.DLC memory) {
        return this.getDLC(uuid);
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

    function _hasAnyRole(address account) internal view returns (bool) {
        return
            hasRole(DLC_ADMIN_ROLE, account) ||
            hasRole(WHITELISTED_CONTRACT, account) ||
            hasRole(APPROVED_SIGNER, account);
    }

    function grantRole(
        bytes32 role,
        address account
    ) public override(AccessControlDefaultAdminRulesUpgradeable) {
        if (_hasAnyRole(account)) revert IncompatibleRoles();

        // role based setup ensures that address can only be added once
        super.grantRole(role, account);
        if (role == APPROVED_SIGNER) _signerCount++;
    }

    function revokeRole(
        bytes32 role,
        address account
    ) public override(AccessControlDefaultAdminRulesUpgradeable) {
        super.revokeRole(role, account);

        if (role == APPROVED_SIGNER) {
            if (_signerCount == _minimumThreshold)
                revert ThresholdMinimumReached(_minimumThreshold);
            _signerCount--;
        }
    }

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

    function getMinimumThreshold() external view onlyAdmin returns (uint16) {
        return _minimumThreshold;
    }

    function getSignerCount() external view onlyAdmin returns (uint16) {
        return _signerCount;
    }

    function setTSSCommitment(bytes32 commitment) external onlyAdmin {
        tssCommitment = commitment;
    }

    function setAttestorGroupPubKey(string calldata pubKey) external onlyAdmin {
        attestorGroupPubKey = pubKey;
    }

    function whitelistAddress(address addressToWhitelist) external onlyAdmin {
        _whitelistedAddresses[addressToWhitelist] = true;
        emit WhitelistAddress(addressToWhitelist);
    }

    function unwhitelistAddress(
        address addressToUnWhitelist
    ) external onlyAdmin {
        _whitelistedAddresses[addressToUnWhitelist] = false;
        emit UnwhitelistAddress(addressToUnWhitelist);
    }

    function setMinimumDeposit(uint256 newMinimumDeposit) external onlyAdmin {
        minimumDeposit = newMinimumDeposit;
        emit SetMinimumDeposit(newMinimumDeposit);
    }

    function setMaximumDeposit(uint256 newMaximumDeposit) external onlyAdmin {
        maximumDeposit = newMaximumDeposit;
        emit SetMaximumDeposit(newMaximumDeposit);
    }

    function setBtcMintFeeRate(uint256 newBtcMintFeeRate) external onlyAdmin {
        if (newBtcMintFeeRate > 10000)
            revert FeeRateOutOfBounds(newBtcMintFeeRate);
        btcMintFeeRate = newBtcMintFeeRate;
        emit SetBtcMintFeeRate(newBtcMintFeeRate);
    }

    function setBtcRedeemFeeRate(
        uint256 newBtcRedeemFeeRate
    ) external onlyAdmin {
        btcRedeemFeeRate = newBtcRedeemFeeRate;
        emit SetBtcRedeemFeeRate(newBtcRedeemFeeRate);
    }

    function setBtcFeeRecipient(
        string calldata btcFeeRecipientToSet
    ) external onlyAdmin {
        btcFeeRecipient = btcFeeRecipientToSet;
        emit SetBtcFeeRecipient(btcFeeRecipient);
    }

    function setWhitelistingEnabled(
        bool isWhitelistingEnabled
    ) external onlyAdmin {
        whitelistingEnabled = isWhitelistingEnabled;
        emit SetWhitelistingEnabled(isWhitelistingEnabled);
    }

    function transferTokenContractOwnership(
        address newOwner
    ) external onlyAdmin {
        dlcBTC.transferOwnership(newOwner);
        emit TransferTokenContractOwnership(newOwner);
    }

    function blacklistOnTokenContract(address account) external onlyAdmin {
        dlcBTC.blacklist(account);
    }

    function unblacklistOnTokenContract(address account) external onlyAdmin {
        dlcBTC.unblacklist(account);
    }

    function setMinterOnTokenContract(address minter) external onlyAdmin {
        dlcBTC.setMinter(minter);
    }

    function setBurnerOnTokenContract(address burner) external onlyAdmin {
        dlcBTC.setBurner(burner);
    }

    // These two functions are used to migrate data from
    // the legacy TokenManager contract
    function setUserVaultUUIDs(
        address user,
        bytes32[] calldata uuids
    ) external onlyAdmin {
        userVaults[user] = uuids;
    }

    function setWhitelistedAddresses(
        address[] calldata addresses
    ) external onlyAdmin {
        for (uint256 i = 0; i < addresses.length; i++) {
            this.whitelistAddress(addresses[i]);
        }
    }
}
