// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../../IDLCManager.sol";
import "../../DLCLinkCompatible.sol";
// import "hardhat/console.sol";

enum LoanStatus {
    None,
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
    string[] attestorList;
    LoanStatus status;
    uint256 vaultLoan; // the borrowed amount
    uint256 vaultCollateral; // btc deposit in sats
    uint256 liquidationRatio; // the collateral/loan ratio below which liquidation can happen (140% = u14000)
    uint256 liquidationFee; // additional fee taken during liquidation, two decimals precision (10% = u1000)
    address owner; // the account owning this loan
    string fundingTx;
    string closingTx;
}

/**
 * @author  DLC.Link.
 * @title   LendingContract.
 * @dev     Not to be used in production.
 * @notice  This is an example contract showing a simple interfacing with the DLCManager contract.
 */
contract LendingContract is DLCLinkCompatible, AccessControl {
    using SafeMath for uint256;
    IDLCManager private _dlcManager;
    IERC20 private _usdc;
    AggregatorV3Interface private _btcPriceFeed;
    address private _protocolWalletAddress;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant DLC_MANAGER_ROLE = keccak256("DLC_MANAGER_ROLE");
    uint256 public index = 0;
    mapping(uint256 => Loan) public loans;
    mapping(bytes32 => uint256) public loanIDsByUUID;
    mapping(address => uint256) public loansPerAddress;

    uint256 public liquidationRatio = 14000; // 140.00%
    uint256 public liquidationFee = 1000; // 10.00%

    constructor(
        address _dlcManagerAddress,
        address _usdcAddress,
        address _protocolWallet,
        address _priceFeedAddress
    ) {
        _dlcManager = IDLCManager(_dlcManagerAddress);
        _usdc = IERC20(_usdcAddress);
        _protocolWalletAddress = _protocolWallet;
        _btcPriceFeed = AggregatorV3Interface(_priceFeedAddress);
        _setupRole(ADMIN_ROLE, _msgSender());
        _setupRole(DLC_MANAGER_ROLE, _dlcManagerAddress);
    }

    modifier onlyAdmin() {
        require(
            hasRole(ADMIN_ROLE, _msgSender()),
            "LendingContract: must have admin role to perform this action"
        );
        _;
    }

    modifier onlyDLCManager() {
        require(
            hasRole(DLC_MANAGER_ROLE, _msgSender()),
            "LendingContract: must have dlc-manager role to perform this action"
        );
        _;
    }

    function setProtocolWallet(address _protocolWallet) external onlyAdmin {
        _protocolWalletAddress = _protocolWallet;
    }

    function setLiquidationRatio(uint256 _ratio) external onlyAdmin {
        liquidationRatio = _ratio;
    }

    function setLiquidationFee(uint256 _fee) external onlyAdmin {
        liquidationFee = _fee;
    }

    event SetupLoan(
        bytes32 dlcUUID,
        uint256 btcDeposit,
        uint256 liquidationRatio,
        uint256 liquidationFee,
        uint256 index,
        string[] attestorList,
        address owner
    );

    function setupLoan(uint256 btcDeposit) external returns (uint256) {
        (bytes32 _uuid, string[] memory attestorList) = _dlcManager.createDLC(
            _protocolWalletAddress,
            btcDeposit
        );

        loans[index] = Loan({
            id: index,
            dlcUUID: _uuid,
            attestorList: attestorList,
            status: LoanStatus.Ready,
            vaultLoan: 0,
            vaultCollateral: btcDeposit,
            liquidationRatio: liquidationRatio,
            liquidationFee: liquidationFee,
            owner: msg.sender,
            fundingTx: "",
            closingTx: ""
        });

        loanIDsByUUID[_uuid] = index;

        emit SetupLoan(
            _uuid,
            btcDeposit,
            liquidationRatio,
            liquidationFee,
            index,
            attestorList,
            msg.sender
        );

        emit StatusUpdate(index, _uuid, LoanStatus.Ready);

        loansPerAddress[msg.sender]++;
        index++;

        return (index - 1);
    }

    event StatusUpdate(uint256 loanid, bytes32 dlcUUID, LoanStatus newStatus);

    function _updateStatus(uint256 _loanID, LoanStatus _status) internal {
        Loan storage _loan = loans[_loanID];
        require(_loan.status != _status, "Status already set");
        _loan.status = _status;
        require(_loan.status == _status, "Failed to set status");
        emit StatusUpdate(_loanID, _loan.dlcUUID, _status);
    }

    function setStatusFunded(
        bytes32 _uuid,
        string calldata btxTxId
    ) external override onlyDLCManager {
        require(loans[loanIDsByUUID[_uuid]].dlcUUID != 0, "No such loan");
        _updateStatus(loanIDsByUUID[_uuid], LoanStatus.Funded);
        loans[loanIDsByUUID[_uuid]].fundingTx = btxTxId;
    }

    event BorrowEvent(
        uint256 loanid,
        bytes32 dlcUUID,
        uint256 amount,
        uint256 vaultLoan,
        LoanStatus status
    );

    function borrow(uint256 _loanID, uint256 _amount) public {
        Loan storage _loan = loans[_loanID];
        require(_loan.owner == msg.sender, "Unathorized");
        require(_loan.status == LoanStatus.Funded, "Loan not funded");
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
        LoanStatus status
    );

    function repay(uint256 _loanID, uint256 _amount) public {
        Loan storage _loan = loans[_loanID];
        require(_loan.owner == msg.sender, "Unathorized");
        require(_loan.vaultLoan >= _amount, "Amount too large");
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
        require(_loan.owner == msg.sender, "Unathorized");
        require(_loan.vaultLoan == 0, "Loan not repaid");
        _updateStatus(_loanID, LoanStatus.PreRepaid);
        _dlcManager.closeDLC(_loan.dlcUUID, 0);
    }

    function postCloseDLCHandler(
        bytes32 _uuid,
        string calldata _btxTxId
    ) external onlyDLCManager {
        Loan storage _loan = loans[loanIDsByUUID[_uuid]];
        require(_loan.dlcUUID != 0, "No such loan");
        require(
            _loan.status == LoanStatus.PreRepaid ||
                _loan.status == LoanStatus.PreLiquidated,
            "Invalid Loan Status"
        );
        _loan.closingTx = _btxTxId;
        _updateStatus(
            _loan.id,
            _loan.status == LoanStatus.PreRepaid
                ? LoanStatus.Repaid
                : LoanStatus.Liquidated
        );
    }

    event DoesNotNeedLiquidation(
        uint256 loanid,
        bytes32 dlcUUID,
        LoanStatus status
    );

    function attemptLiquidate(uint256 _loanID) public {
        // Gives back BTC price data. 8 decimals, e.g. $22,836 = 2283600000000
        (, int256 _price, , , ) = _btcPriceFeed.latestRoundData();
        Loan memory _loan = loans[_loanID];
        bool _needsLiquidation = checkLiquidation(_loan.id, _price);
        if (!_needsLiquidation) {
            emit DoesNotNeedLiquidation(_loan.id, _loan.dlcUUID, _loan.status);
            return;
        }
        uint16 _payoutRatio = calculatePayoutRatio(_loan.id, _price);
        _liquidateLoan(_loan.id, _payoutRatio);
    }

    function _liquidateLoan(uint256 _loanID, uint16 _payoutRatio) internal {
        _updateStatus(_loanID, LoanStatus.PreLiquidated);
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
    ) public view returns (uint16) {
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

        return _payoutRatio >= 10000 ? 10000 : uint16(_payoutRatio);
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
}
