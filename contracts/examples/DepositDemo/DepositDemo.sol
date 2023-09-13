// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '../../DLCManagerV1.sol';
import '../../DLCLinkCompatibleV1.sol';
import 'hardhat/console.sol';
import '../NFTMinting/DLCBTC.sol';

enum DepositStatus {
    None,
    Ready,
    Funded,
    PreClosed,
    Closed
}

struct Deposit {
    uint256 id;
    bytes32 dlcUUID;
    string[] attestorList;
    DepositStatus status;
    uint256 depositAmount; // btc deposit in sats
    address owner; // the account owning this loan
    string btcTxId;
}

contract DepositDemo is DLCLinkCompatibleV1, AccessControl {
    using Math for uint256;
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant DLC_MANAGER_ROLE = keccak256('DLC_MANAGER_ROLE');

    DLCManagerV1 private _dlcManager;
    DLCBTC private _dlcBTC;

    address private _protocolWalletAddress;
    uint256 public index = 0;

    mapping(uint256 => Deposit) public deposits;
    mapping(bytes32 => uint256) public depositIDsByUUID;
    mapping(address => uint256) public depositsPerAddress;

    constructor(
        address _dlcManagerAddress,
        address _dlcBTCAddress,
        address _protocolWallet
    ) {
        _dlcManager = DLCManagerV1(_dlcManagerAddress);
        _dlcBTC = DLCBTC(_dlcBTCAddress);
        _protocolWalletAddress = _protocolWallet;
        _setupRole(ADMIN_ROLE, _msgSender());
        _setupRole(DLC_MANAGER_ROLE, _dlcManagerAddress);
    }

    modifier onlyAdmin() {
        require(
            hasRole(ADMIN_ROLE, _msgSender()),
            'DepositDemo: must have admin role to perform this action'
        );
        _;
    }

    modifier onlyDLCManager() {
        require(
            hasRole(DLC_MANAGER_ROLE, _msgSender()),
            'DepositDemo: must have dlc-manager role to perform this action'
        );
        _;
    }

    function setProtocolWallet(address _protocolWallet) external onlyAdmin {
        _protocolWalletAddress = _protocolWallet;
    }

    event SetupDeposit(
        bytes32 dlcUUID,
        uint256 btcDeposit,
        uint256 index,
        string[] attestorList,
        address owner
    );

    function setupDeposit(
        uint256 btcDeposit,
        uint8 attestorCount
    ) external returns (uint256) {
        (bytes32 _uuid, string[] memory attestorList) = _dlcManager.createDLC(
            _protocolWalletAddress,
            attestorCount
        );

        deposits[index] = Deposit({
            id: index,
            dlcUUID: _uuid,
            attestorList: attestorList,
            status: DepositStatus.Ready,
            depositAmount: btcDeposit,
            owner: msg.sender,
            btcTxId: ''
        });

        depositIDsByUUID[_uuid] = index;

        emit SetupDeposit(_uuid, btcDeposit, index, attestorList, msg.sender);

        emit StatusUpdate(index, _uuid, DepositStatus.Ready);

        depositsPerAddress[msg.sender]++;
        index++;

        return (index - 1);
    }

    event StatusUpdate(
        uint256 loanid,
        bytes32 dlcUUID,
        DepositStatus newStatus
    );

    function _updateStatus(uint256 _depositID, DepositStatus _status) internal {
        Deposit storage _deposit = deposits[_depositID];
        require(_deposit.status != _status, 'Status already set');
        _deposit.status = _status;
        emit StatusUpdate(_depositID, _deposit.dlcUUID, _status);
    }

    function setStatusFunded(bytes32 _uuid) external override onlyDLCManager {
        uint256 _depositID = depositIDsByUUID[_uuid];
        require(deposits[_depositID].dlcUUID != 0, 'No deposit with that uuid');
        _updateStatus(_depositID, DepositStatus.Funded);
        Deposit memory _deposit = deposits[_depositID];
        _dlcBTC.mint(_deposit.owner, _deposit.depositAmount);
    }

    function calculatePayout(
        uint256 _depositID,
        uint256 _tokens
    ) public view returns (uint256 _payoutRatio) {
        Deposit memory _deposit = deposits[_depositID];
        uint256 _depositAmount = _deposit.depositAmount;
        return Math.mulDiv(_tokens, 10000, _depositAmount);
    }

    // This could be extended for partial closings
    // function closeDeposit(uint256 _depositID, uint256 _tokens) public { ....
    // ...

    // For now, we require the user returns all the tokens to close the deposit.
    function closeDeposit(uint256 _depositID) public {
        Deposit memory _deposit = deposits[_depositID];
        require(_deposit.owner == msg.sender, 'Unauthorized');
        require(
            _dlcBTC.balanceOf(_deposit.owner) >= _deposit.depositAmount,
            'Insufficient dlcBTC balance'
        );

        _dlcBTC.burnFrom(_deposit.owner, _deposit.depositAmount);

        _updateStatus(_depositID, DepositStatus.PreClosed);

        // uint16 outcome = uint16(calculatePayout(_depositID, _tokens))
        uint16 outcome = 10000;

        _dlcManager.closeDLC(_deposit.dlcUUID, outcome);
    }

    function postCloseDLCHandler(
        bytes32 _uuid,
        string calldata _btxTxId
    ) external onlyDLCManager {
        Deposit storage _deposit = deposits[depositIDsByUUID[_uuid]];
        require(_deposit.dlcUUID != 0, 'No deposit with that uuid');
        require(
            _deposit.status == DepositStatus.PreClosed,
            'Invalid Deposit Status'
        );
        _deposit.btcTxId = _btxTxId;
        _updateStatus(_deposit.id, DepositStatus.Closed);
    }

    function getDeposit(
        uint256 _depositID
    ) public view returns (Deposit memory) {
        return deposits[_depositID];
    }

    function getDepositByUUID(
        bytes32 _uuid
    ) public view returns (Deposit memory) {
        return deposits[depositIDsByUUID[_uuid]];
    }

    function getAllDepositsForAddress(
        address _addy
    ) public view returns (Deposit[] memory) {
        Deposit[] memory ownedDeposits = new Deposit[](
            depositsPerAddress[_addy]
        );
        uint256 j = 0;
        for (uint256 i = 0; i < index; i++) {
            if (deposits[i].owner == _addy) {
                ownedDeposits[j++] = deposits[i];
            }
        }
        return ownedDeposits;
    }
}
