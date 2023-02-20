// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./BtcNft.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../../DLCManager.sol";
import "../../DLCLinkCompatible.sol";

enum Status {
    None,
    NotReady,
    Ready,
    Funded,
    NftIssued,
    PreRepaid,
    Repaid,
    PreLiquidated,
    Liquidated
}

struct Vault {
    uint256 id;
    bytes32 dlcUUID;
    Status status;
    uint256 vaultCollateral; // btc deposit in sats
    uint256 nftId;
    address owner; // the account owning this Vault
}

// TODO: setup access control, which will also change the tests
uint256 constant ALL_FOR_DEPOSITOR = 0;
uint256 constant ALL_FOR_BROKER = 100;

contract DlcBroker is DLCLinkCompatible {
    using SafeMath for uint256;
    DLCManager private _dlcManager;
    BtcNft private _btcNft;

    uint256 public index = 0;
    mapping(uint256 => Vault) public vaults;
    mapping(bytes32 => uint256) public vaultIDsByUUID;
    mapping(address => uint256) public vaultsPerAddress;

    constructor(address _dlcManagerAddress, address _dlcNftAddress) {
        _dlcManager = DLCManager(_dlcManagerAddress);
        _btcNft = BtcNft(_dlcNftAddress);
    }

    event SetupVault(
        bytes32 dlcUUID,
        uint256 btcDeposit,
        uint256 emergencyRefundTime,
        uint256 index,
        address owner
    );

    function setupVault(
        uint256 btcDeposit,
        uint256 emergencyRefundTime
    ) external returns (uint256) {
        // Calling the dlc-manager contract & getting a uuid
        bytes32 _uuid = _dlcManager.createDLC(emergencyRefundTime, index);

        vaults[index] = Vault({
            id: index,
            dlcUUID: _uuid,
            status: Status.NotReady,
            vaultCollateral: btcDeposit,
            nftId: 0,
            owner: msg.sender
        });

        vaultIDsByUUID[_uuid] = index;

        emit SetupVault(
            _uuid,
            btcDeposit,
            emergencyRefundTime,
            index,
            msg.sender
        );

        emit StatusUpdate(index, _uuid, Status.NotReady);

        vaultsPerAddress[msg.sender]++;
        index++;

        return (index - 1);
    }

    event StatusUpdate(uint256 vaultid, bytes32 dlcUUID, Status newStatus);

    function _updateStatus(uint256 _vaultID, Status _status) internal {
        Vault storage _vault = vaults[_vaultID];
        require(_vault.status != _status, "Status already set");
        _vault.status = _status;
        require(_vault.status == _status, "Failed to set status");
        emit StatusUpdate(_vaultID, _vault.dlcUUID, _status);
    }

    function postCreateDLCHandler(bytes32 _uuid) public {
        Vault memory _vault = vaults[vaultIDsByUUID[_uuid]];
        require(_vault.dlcUUID != 0, "No such vault");
        _updateStatus(_vault.id, Status.Ready);
    }

    function setStatusFunded(bytes32 _uuid) public {
        Vault memory _vault = vaults[vaultIDsByUUID[_uuid]];
        require(_vault.dlcUUID != 0, "No such vault");
        _updateStatus(_vault.id, Status.Funded);
        mintBtcNft(_uuid, _vault.vaultCollateral);
    }

    function mintBtcNft(bytes32 _uuid, uint256 _collateral) private {
        Vault storage _vault = vaults[vaultIDsByUUID[_uuid]];
        require(_vault.dlcUUID != 0, "No such vault");
        require(_vault.status == Status.Funded, "Vault in wrong state");
        _dlcManager.mintBtcNft(_uuid, _collateral);
    }

    event MintBtcNft(bytes32 dlcUUID, uint256 btcDeposit);

    function postMintBtcNft(bytes32 _uuid, uint256 _nftId) external {
        Vault storage _vault = vaults[vaultIDsByUUID[_uuid]];
        require(_vault.dlcUUID != 0, "No such vault");
        _vault.nftId = _nftId;
        _updateStatus(_vault.id, Status.NftIssued);
        emit MintBtcNft(_uuid, _nftId);
    }

    event BurnBtcNft(bytes32 dlcUUID, uint256 nftId);

    function closeVault(uint256 _vaultID) public {
        uint256 _payoutRatio;
        Vault storage _vault = vaults[_vaultID];
        require(_vault.dlcUUID != 0, "No such vault");
        require(_vault.status == Status.NftIssued, "Vault in wrong state");
        if (_vault.owner == msg.sender) {
            //closing a vault where I was the depositor
            _payoutRatio = ALL_FOR_DEPOSITOR;
        } else {
            _payoutRatio = ALL_FOR_BROKER;
            //closing a vault where I was not the depositor
        }
        _btcNft.burn(_vault.nftId);
        _updateStatus(_vaultID, Status.PreRepaid);
        emit BurnBtcNft(_vault.dlcUUID, _vault.nftId);
        _dlcManager.closeDLC(_vault.dlcUUID, _payoutRatio);
    }

    function postCloseDLCHandler(bytes32 _uuid) external {
        Vault storage _vault = vaults[vaultIDsByUUID[_uuid]];
        require(vaults[vaultIDsByUUID[_uuid]].dlcUUID != 0, "No such vault");
        require(
            _vault.status == Status.PreRepaid ||
                _vault.status == Status.PreLiquidated,
            "Invalid Vault Status"
        );
        _updateStatus(
            _vault.id,
            _vault.status == Status.PreRepaid
                ? Status.Repaid
                : Status.Liquidated
        );
    }

    function getVault(uint256 _vaultID) public view returns (Vault memory) {
        return vaults[_vaultID];
    }

    function getVaultByUUID(bytes32 _uuid) public view returns (Vault memory) {
        return vaults[vaultIDsByUUID[_uuid]];
    }

    function getAllVaultsForAddress(
        address _addy
    ) public view returns (Vault[] memory) {
        Vault[] memory ownedVaults = new Vault[](vaultsPerAddress[_addy]);
        uint256 j = 0;
        for (uint256 i = 0; i < index; i++) {
            if (vaults[i].owner == _addy) {
                ownedVaults[j++] = vaults[i];
            }
        }
        return ownedVaults;
    }

    function getBtcPriceCallback(
        bytes32 uuid,
        int256 price,
        uint256 timestamp
    ) external {}
}
