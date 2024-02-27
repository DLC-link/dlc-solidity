// // SPDX-License-Identifier: MIT
// pragma solidity 0.8.17;

// import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
// import "./BtcNft.sol";
// import "@openzeppelin/contracts/utils/math/SafeMath.sol";
// import "@openzeppelin/contracts/access/AccessControl.sol";
// import "@openzeppelin/contracts/utils/Address.sol";
// import "@openzeppelin/contracts/utils/Strings.sol";
// import "../../DLCManager.sol";
// import "../../DLCLinkCompatible.sol";
// import "./DLCBTC.sol";

// enum VaultStatus {
//     None,
//     Ready,
//     Funded,
//     NftIssued,
//     PreRepaid,
//     Repaid,
//     PreLiquidated,
//     Liquidated
// }

// struct Vault {
//     uint256 id;
//     bytes32 dlcUUID;
//     VaultStatus status;
//     uint256 vaultCollateral; // btc deposit in sats
//     uint256 nftId;
//     address owner; // the account owning this Vault
//     address originalCreator;
//     string fundingTx;
//     string closingTx;
// }

// uint16 constant ALL_FOR_DEPOSITOR = 0;
// uint16 constant ALL_FOR_ROUTER = 100;

// contract DlcRouter is DLCLinkCompatible, AccessControl {
//     using SafeMath for uint256;
//     using Address for address;

//     bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
//     bytes32 public constant DLC_MANAGER_ROLE = keccak256("DLC_MANAGER_ROLE");
//     IDLCManager private _dlcManager;
//     BtcNft private _btcNft;
//     DLCBTCExample private _dlcBTC;
//     address private _protocolWalletAddress;
//     string private _ipfsStorageURL =
//         "bafybeif6m56tynghkfpkafsfr2hgezvksxgxvrpdcaklvyx7zn7xbzme7i";

//     uint256 public index = 0;
//     mapping(uint256 => Vault) public vaults;
//     mapping(bytes32 => uint256) public vaultIDsByUUID;
//     mapping(address => uint256) public vaultsPerAddress;

//     constructor(
//         address _dlcManagerAddress,
//         address _dlcNftAddress,
//         address _dlcBTCAddress,
//         address _protocolWallet
//     ) {
//         require(
//             _dlcManagerAddress != address(0) &&
//                 _dlcNftAddress != address(0) &&
//                 _dlcBTCAddress != address(0),
//             "DlcRouter: invalid addresses"
//         );
//         _dlcManager = IDLCManager(_dlcManagerAddress);
//         _btcNft = BtcNft(_dlcNftAddress);
//         _dlcBTC = DLCBTCExample(_dlcBTCAddress);
//         _protocolWalletAddress = _protocolWallet;
//         _setupRole(ADMIN_ROLE, _msgSender());
//         _setupRole(DLC_MANAGER_ROLE, _dlcManagerAddress);
//     }

//     modifier onlyAdmin() {
//         require(
//             hasRole(ADMIN_ROLE, _msgSender()),
//             "DlcRouter: must have admin role to perform this action"
//         );
//         _;
//     }

//     modifier onlyDLCManager() {
//         require(
//             hasRole(DLC_MANAGER_ROLE, _msgSender()),
//             "LendingContract: must have dlc-manager role to perform this action"
//         );
//         _;
//     }

//     function setProtocolWallet(address _protocolWallet) external onlyAdmin {
//         _protocolWalletAddress = _protocolWallet;
//     }

//     event SetupVault(
//         bytes32 dlcUUID,
//         uint256 btcDeposit,
//         uint256 index,
//         address owner
//     );

//     function setupVault(uint256 btcDeposit) external returns (uint256) {
//         require(btcDeposit > 0, "DlcRouter: btcDeposit must be greater than 0");

//         // Calling the dlc-manager contract & getting a uuid
//         bytes32 _uuid = _dlcManager.createDLC(
//             _protocolWalletAddress,
//             btcDeposit,
//             0,
//             "0x",
//             0
//         );

//         vaults[index] = Vault({
//             id: index,
//             dlcUUID: _uuid,
//             status: VaultStatus.Ready,
//             vaultCollateral: btcDeposit,
//             nftId: 0,
//             owner: msg.sender,
//             originalCreator: msg.sender,
//             fundingTx: "",
//             closingTx: ""
//         });

//         vaultIDsByUUID[_uuid] = index;

//         emit SetupVault(_uuid, btcDeposit, index, msg.sender);

//         emit StatusUpdate(index, _uuid, VaultStatus.Ready);

//         vaultsPerAddress[msg.sender]++;
//         index++;

//         return (index - 1);
//     }

//     event StatusUpdate(uint256 vaultid, bytes32 dlcUUID, VaultStatus newStatus);

//     function _updateStatus(uint256 _vaultID, VaultStatus _status) private {
//         Vault storage _vault = vaults[_vaultID];
//         require(_vault.status != _status, "VaultStatus already set");
//         _vault.status = _status;
//         emit StatusUpdate(_vaultID, _vault.dlcUUID, _status);
//     }

//     function setStatusFunded(
//         bytes32 _uuid,
//         string calldata btxTxId
//     ) external override onlyDLCManager {
//         Vault memory _vault = vaults[vaultIDsByUUID[_uuid]];
//         require(_vault.dlcUUID != 0, "No such vault");
//         _updateStatus(_vault.id, VaultStatus.Funded);
//         _vault.fundingTx = btxTxId;
//     }

//     event MintBtcNft(bytes32 dlcUUID, uint256 nftId);

//     function mintBtcNft(bytes32 _uuid, string memory _uri) public onlyAdmin {
//         Vault storage _vault = vaults[vaultIDsByUUID[_uuid]];
//         require(_vault.dlcUUID != 0, "No such vault");
//         require(_vault.status == VaultStatus.Funded, "Vault in wrong state");
//         _vault.nftId = _btcNft.getNextMintId();
//         // NOTE: DlcBroker contract must have MINTER_ROLE on btcNft
//         _btcNft.safeMint(_vault.owner, _uri, address(this), _uuid);
//         _updateStatus(_vault.id, VaultStatus.NftIssued);
//         emit MintBtcNft(_uuid, _vault.nftId);
//     }

//     event BurnBtcNft(bytes32 dlcUUID, uint256 nftId);

//     function closeVault(uint256 _vaultID) public {
//         uint16 _payoutRatio;
//         Vault storage _vault = vaults[_vaultID];

//         address _nftOwner = _btcNft.ownerOf(_vault.nftId);
//         require(_nftOwner == msg.sender, "Unauthorized");

//         require(_vault.dlcUUID != 0, "No such vault");
//         require(_vault.status == VaultStatus.NftIssued, "Vault in wrong state");
//         if (_vault.owner == msg.sender) {
//             //closing a vault where original creator is redeeming
//             _payoutRatio = ALL_FOR_DEPOSITOR;
//             _updateStatus(_vaultID, VaultStatus.PreRepaid);
//         } else {
//             //closing a vault where non-creator redeems
//             _payoutRatio = ALL_FOR_ROUTER;
//             // This is so that the redeemer can get the collateral in the callback
//             vaultsPerAddress[_vault.owner]--;
//             _vault.owner = msg.sender;
//             vaultsPerAddress[msg.sender]++;
//             _updateStatus(_vaultID, VaultStatus.PreLiquidated);
//         }
//         _dlcManager.closeDLC(_vault.dlcUUID, _payoutRatio);
//         _btcNft.burn(_vault.nftId);
//         emit BurnBtcNft(_vault.dlcUUID, _vault.nftId);
//     }

//     function postCloseDLCHandler(
//         bytes32 _uuid,
//         string calldata _btxTxId
//     ) external onlyDLCManager {
//         Vault storage _vault = vaults[vaultIDsByUUID[_uuid]];
//         require(vaults[vaultIDsByUUID[_uuid]].dlcUUID != 0, "No such vault");
//         require(
//             _vault.status == VaultStatus.PreRepaid ||
//                 _vault.status == VaultStatus.PreLiquidated,
//             "Invalid Vault VaultStatus"
//         );

//         _vault.closingTx = _btxTxId;

//         if (_vault.status == VaultStatus.PreLiquidated) {
//             _updateStatus(_vault.id, VaultStatus.Liquidated);
//             // Minting the collateral to the liquidator
//             _dlcBTC.mint(_vault.owner, _vault.vaultCollateral);
//         } else {
//             _updateStatus(_vault.id, VaultStatus.Repaid);
//         }
//     }

//     function getVault(uint256 _vaultID) public view returns (Vault memory) {
//         return vaults[_vaultID];
//     }

//     function getVaultByUUID(bytes32 _uuid) public view returns (Vault memory) {
//         return vaults[vaultIDsByUUID[_uuid]];
//     }

//     function getAllVaultsForAddress(
//         address _addy
//     ) public view returns (Vault[] memory) {
//         Vault[] memory ownedVaults = new Vault[](vaultsPerAddress[_addy]);
//         uint256 j = 0;
//         for (uint256 i = 0; i < index; i++) {
//             if (vaults[i].owner == _addy) {
//                 ownedVaults[j++] = vaults[i];
//             }
//         }
//         return ownedVaults;
//     }
// }
