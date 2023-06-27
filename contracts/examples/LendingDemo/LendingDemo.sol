// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '../../DLCManagerV0.sol';
import '../../DLCLinkCompatibleV0.sol';
import 'hardhat/console.sol';

enum Status {
    None,
    NotReady,
    Ready,
    Funded,
    PreRepaid,
    Repaid,
    PreLiquidated,
    Liquidated
}

struct Loan {
    uint256 id;
    bytes32 dlcUUID;
    Status status;
    uint256 vaultLoan; // the borrowed amount
    uint256 vaultCollateral; // btc deposit in sats
    uint256 liquidationRatio; // the collateral/loan ratio below which liquidation can happen, with two decimals precision (140% = u14000)
    uint256 liquidationFee; // additional fee taken during liquidation, two decimals precision (10% = u1000)
    uint256 closingPrice; // In case of liquidation, the closing BTC price will be stored here
    address owner; // the account owning this loan
}

contract LendingContract is DLCLinkCompatible, AccessControl {
    using SafeMath for uint256;
    DLCManagerV0 private _dlcManager;
    IERC20 private _usdc;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant DLC_MANAGER_ROLE = keccak256('DLC_MANAGER_ROLE');
    uint256 public index = 0;
    mapping(uint256 => Loan) public loans;
    mapping(bytes32 => uint256) public loanIDsByUUID;
    mapping(address => uint256) public loansPerAddress;

    constructor(address _dlcManagerAddress, address _usdcAddress) {
        _dlcManager = DLCManagerV0(_dlcManagerAddress);
        _usdc = IERC20(_usdcAddress);
        _setupRole(ADMIN_ROLE, _msgSender());
        _setupRole(DLC_MANAGER_ROLE, _dlcManagerAddress);
    }

    modifier onlyAdmin() {
        require(
            hasRole(ADMIN_ROLE, _msgSender()),
            'LendingContract: must have admin role to perform this action'
        );
        _;
    }

    modifier onlyDLCManager() {
        require(
            hasRole(DLC_MANAGER_ROLE, _msgSender()),
            'LendingContract: must have dlc-manager role to perform this action'
        );
        _;
    }

    event SetupLoan(
        bytes32 dlcUUID,
        uint256 btcDeposit,
        uint256 liquidationRatio,
        uint256 liquidationFee,
        uint256 emergencyRefundTime,
        uint256 index,
        address owner
    );

    function setupLoan(
        uint256 btcDeposit,
        uint256 liquidationRatio,
        uint256 liquidationFee,
        uint256 emergencyRefundTime
    ) external returns (uint256) {
        // Calling the dlc-manager contract & getting a uuid
        bytes32 _uuid = _dlcManager.createDLC(emergencyRefundTime, index);

        loans[index] = Loan({
            id: index,
            dlcUUID: _uuid,
            status: Status.NotReady,
            vaultLoan: 0,
            vaultCollateral: btcDeposit,
            liquidationRatio: liquidationRatio,
            liquidationFee: liquidationFee,
            closingPrice: 0,
            owner: msg.sender
        });

        loanIDsByUUID[_uuid] = index;

        emit SetupLoan(
            _uuid,
            btcDeposit,
            liquidationRatio,
            liquidationFee,
            emergencyRefundTime,
            index,
            msg.sender
        );

        emit StatusUpdate(index, _uuid, Status.NotReady);

        loansPerAddress[msg.sender]++;
        index++;

        return (index - 1);
    }

    event StatusUpdate(uint256 loanid, bytes32 dlcUUID, Status newStatus);

    function _updateStatus(uint256 _loanID, Status _status) internal {
        Loan storage _loan = loans[_loanID];
        require(_loan.status != _status, 'Status already set');
        _loan.status = _status;
        require(_loan.status == _status, 'Failed to set status');
        emit StatusUpdate(_loanID, _loan.dlcUUID, _status);
    }

    function postCreateDLCHandler(bytes32 _uuid) public onlyDLCManager {
        require(loans[loanIDsByUUID[_uuid]].dlcUUID != 0, 'No such loan');
        _updateStatus(loanIDsByUUID[_uuid], Status.Ready);
    }

    function setStatusFunded(bytes32 _uuid) public onlyDLCManager {
        require(loans[loanIDsByUUID[_uuid]].dlcUUID != 0, 'No such loan');
        _updateStatus(loanIDsByUUID[_uuid], Status.Funded);
    }

    event BorrowEvent(
        uint256 loanid,
        bytes32 dlcUUID,
        uint256 amount,
        uint256 vaultLoan,
        Status status
    );

    function borrow(uint256 _loanID, uint256 _amount) public {
        Loan storage _loan = loans[_loanID];
        require(_loan.owner == msg.sender, 'Unathorized');
        require(_loan.status == Status.Funded, 'Loan not funded');
        // TODO:
        //  - user shouldnt be able to overborrow (based on collateral value)
        // require(_loan.vaultLoan ... )
        _usdc.transfer(_loan.owner, _amount);
        _loan.vaultLoan = _loan.vaultLoan.add(_amount);
        emit BorrowEvent(
            _loanID,
            _loan.dlcUUID,
            _amount,
            _loan.vaultLoan,
            _loan.status
        );
    }

    event RepayEvent(
        uint256 loanid,
        bytes32 dlcUUID,
        uint256 amount,
        uint256 vaultLoan,
        Status status
    );

    function repay(uint256 _loanID, uint256 _amount) public {
        Loan storage _loan = loans[_loanID];
        require(_loan.owner == msg.sender, 'Unathorized');
        require(_loan.vaultLoan >= _amount, 'Amount too large');
        _usdc.transferFrom(_loan.owner, address(this), _amount);
        _loan.vaultLoan = _loan.vaultLoan.sub(_amount);
        emit RepayEvent(
            _loanID,
            _loan.dlcUUID,
            _amount,
            _loan.vaultLoan,
            _loan.status
        );
    }

    function closeLoan(uint256 _loanID) public {
        Loan memory _loan = loans[_loanID];
        require(_loan.owner == msg.sender, 'Unathorized');
        require(_loan.vaultLoan == 0, 'Loan not repaid');
        _updateStatus(_loanID, Status.PreRepaid);
        _dlcManager.closeDLC(_loan.dlcUUID, 0);
    }

    function postCloseDLCHandler(bytes32 _uuid) external onlyDLCManager {
        Loan memory _loan = loans[loanIDsByUUID[_uuid]];
        require(_loan.dlcUUID != 0, 'No such loan');
        require(
            _loan.status == Status.PreRepaid ||
                _loan.status == Status.PreLiquidated,
            'Invalid Loan Status'
        );
        _updateStatus(
            _loan.id,
            _loan.status == Status.PreRepaid ? Status.Repaid : Status.Liquidated
        );
    }

    function attemptLiquidate(uint256 _loanID) public {
        _dlcManager.getBTCPriceWithCallback(loans[_loanID].dlcUUID);
    }

    event DoesNotNeedLiquidation(
        uint256 loanid,
        bytes32 dlcUUID,
        Status status
    );

    function getBtcPriceCallback(
        bytes32 _uuid,
        int256 _price,
        uint256 _timestamp
    ) external onlyDLCManager {
        Loan memory _loan = loans[loanIDsByUUID[_uuid]];

        bool _needsLiquidation = checkLiquidation(_loan.id, _price);
        if (!_needsLiquidation) {
            emit DoesNotNeedLiquidation(_loan.id, _loan.dlcUUID, _loan.status);
            return;
        }
        uint256 _payoutRatio = calculatePayoutRatio(_loan.id, _price);
        _liquidateLoan(_loan.id, _payoutRatio);
    }

    function _liquidateLoan(uint256 _loanID, uint256 _payoutRatio) internal {
        _updateStatus(_loanID, Status.PreLiquidated);
        _dlcManager.closeDLC(loans[_loanID].dlcUUID, _payoutRatio);
    }

    function checkLiquidation(
        uint256 _loanID,
        int256 _price
    ) public view returns (bool) {
        // if liquidationRatio is 14000 (140.00%)
        // and collateralvalue is 2968680000000
        // and price is 2283600000000
        // and vaultLoan is 2000 USDLC -- 20000000000000000000 (16 decimals)
        // We need to check if the collateral/loan ratio is below liquidationRatio%

        uint256 _collateralValue = getCollateralValue(_loanID, _price); // 8 decimals
        uint256 _strikePrice = SafeMath.div(
            SafeMath.mul(
                loans[_loanID].vaultLoan,
                loans[_loanID].liquidationRatio
            ),
            10 ** 14
        );

        return _collateralValue <= _strikePrice;
    }

    function calculatePayoutRatio(
        uint256 _loanID,
        int256 _price
    ) public view returns (uint256) {
        // Should return a number between 0-100.00 (0-10000)
        Loan memory _loan = loans[_loanID];
        uint256 _collateralValue = getCollateralValue(_loanID, _price); // 8 decimals
        uint256 _sellToLiquidatorsRatio = SafeMath.div(
            _loan.vaultLoan,
            _collateralValue
        );
        uint256 _payoutRatioPrecise = _sellToLiquidatorsRatio +
            SafeMath.mul(_sellToLiquidatorsRatio, _loan.liquidationFee);
        uint256 _payoutRatio = SafeMath.div(_payoutRatioPrecise, 10 ** 9);

        return _payoutRatio >= 10000 ? 10000 : _payoutRatio;
    }

    function getCollateralValue(
        uint256 _loanID,
        int256 _price
    ) public view returns (uint256) {
        //  _price is 8 decimals, e.g. $22,836 = 2283600000000
        // If collateral is 1.3 BTC, stored as 130000000 sats
        // 130000000 * 2283600000000 = 2.9E20
        // we divide by 10**8 to get 2968680000000
        return
            SafeMath.div(
                (loans[_loanID].vaultCollateral * uint256(_price)),
                10 ** 8
            );
    }

    function getLoan(uint256 _loanID) public view returns (Loan memory) {
        return loans[_loanID];
    }

    function getLoanByUUID(bytes32 _uuid) public view returns (Loan memory) {
        return loans[loanIDsByUUID[_uuid]];
    }

    function getAllLoansForAddress(
        address _addy
    ) public view returns (Loan[] memory) {
        Loan[] memory ownedLoans = new Loan[](loansPerAddress[_addy]);
        uint256 j = 0;
        for (uint256 i = 0; i < index; i++) {
            if (loans[i].owner == _addy) {
                ownedLoans[j++] = loans[i];
            }
        }
        return ownedLoans;
    }

    function postMintBtcNft(bytes32 _uuid, uint256 _nftId) external {}
}
