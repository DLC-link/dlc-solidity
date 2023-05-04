// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '../../DLCManager.sol';
import '../../DLCLinkCompatible.sol';

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

// TODO: setup access control, which will also change the tests

contract LendingContract is DLCLinkCompatible, AccessControl {
    using SafeMath for uint256;
    DLCManager private _dlcManager;
    IERC20 private _usdc;

    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant DLC_MANAGER_ROLE = keccak256('DLC_MANAGER_ROLE');
    uint256 public index = 0;
    mapping(uint256 => Loan) public loans;
    mapping(bytes32 => uint256) public loanIDsByUUID;
    mapping(address => uint256) public loansPerAddress;

    constructor(address _dlcManagerAddress, address _usdcAddress) {
        _dlcManager = DLCManager(_dlcManagerAddress);
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

    function borrow(uint256 _loanID, uint256 _amount) public {
        Loan storage _loan = loans[_loanID];
        require(_loan.owner == msg.sender, 'Unathorized');
        require(_loan.status == Status.Funded, 'Loan not funded');
        // TODO:
        //  - user shouldnt be able to overborrow (based on collateral value)
        // require(_loan.vaultLoan ... )
        _usdc.transfer(_loan.owner, _amount);
        _loan.vaultLoan = _loan.vaultLoan.add(_amount);
    }

    function repay(uint256 _loanID, uint256 _amount) public {
        Loan storage _loan = loans[_loanID];
        require(_loan.owner == msg.sender, 'Unathorized');
        require(_loan.vaultLoan >= _amount, 'Amount too large');
        _usdc.transferFrom(_loan.owner, address(this), _amount);
        _loan.vaultLoan = _loan.vaultLoan.sub(_amount);
    }

    function closeLoan(uint256 _loanID) public {
        Loan storage _loan = loans[_loanID];
        require(_loan.owner == msg.sender, 'Unathorized');
        require(_loan.vaultLoan == 0, 'Loan not repaid');
        _updateStatus(_loanID, Status.PreRepaid);
        _dlcManager.closeDLC(_loan.dlcUUID, 0);
    }

    function postCloseDLCHandler(bytes32 _uuid) external onlyDLCManager {
        // Access control? dlc-manager?
        Loan storage _loan = loans[loanIDsByUUID[_uuid]];
        require(loans[loanIDsByUUID[_uuid]].dlcUUID != 0, 'No such loan');
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
        // Access control?
        _updateStatus(_loanID, Status.PreLiquidated);
        _dlcManager.getBTCPriceWithCallback(loans[_loanID].dlcUUID);
    }

    function getBtcPriceCallback(
        bytes32 _uuid,
        int256 _price,
        uint256 _timestamp
    ) external onlyDLCManager {
        require(
            checkLiquidation(loanIDsByUUID[_uuid], _price),
            'Does Not Need Liquidation'
        );
        uint16 payoutRatio = calculatePayoutRatio(loanIDsByUUID[_uuid], _price);
        _liquidateLoan(loanIDsByUUID[_uuid], payoutRatio);
    }

    function _liquidateLoan(uint256 _loanID, uint16 _payoutRatio) internal {
        _updateStatus(_loanID, Status.Liquidated);
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
            10 ** 10
        ); // 16 + 2 - 10 = 8 decimals

        return _collateralValue <= _strikePrice;
    }

    function calculatePayoutRatio(
        uint256 _loanID,
        int256 _price
    ) public view returns (uint16) {
        // Should return a number between 0-100.00
        Loan memory _loan = loans[_loanID];
        uint256 _collateralValue = getCollateralValue(_loanID, _price); // 8 decimals
        uint256 _sellToLiquidatorsRatio = SafeMath.div(
            SafeMath.div(_loan.vaultLoan, 10 ** 8),
            _collateralValue
        );
        uint256 _payoutRatioPrecise = _sellToLiquidatorsRatio +
            SafeMath.mul(_sellToLiquidatorsRatio, _loan.liquidationFee);

        return 0;
    }

    // ;; @desc Returns the result±ing payout-ratio at the given btc-price (shifted by 10**8).
    // ;; This value is sent to the Oracle system for signing a point on the linear payout curve.
    // ;; using uints, this means return values between 0-10000 (0.00-100.00)
    // ;; 0.00 means the borrower gets back its deposit, 100.00 means the entire collateral gets taken by the protocol.
    // (define-read-only (get-payout-ratio (loan-id uint) (btc-price uint))
    // (let (
    //     (loan (unwrap! (get-loan loan-id) err-unknown-loan-contract))
    //     (collateral-value (get-collateral-value (get vault-collateral loan) btc-price))
    //     ;; the ratio the protocol has to sell to liquidators:
    //     (sell-to-liquidators-ratio (/ (shift-value (get vault-loan loan) ten-to-power-12) collateral-value))
    //     ;; the additional liquidation-fee percentage is calculated into the result. Since it is shifted by 10000, we divide:
    //     (payout-ratio-precise (+ sell-to-liquidators-ratio (* (/ sell-to-liquidators-ratio u10000) (get liquidation-fee loan))))
    //     ;; The final payout-ratio is a truncated version:
    //     (payout-ratio (unshift-value payout-ratio-precise ten-to-power-12))
    //     )
    //     ;; We cap result to be between the desired bounds
    //     (begin
    //     (if (unwrap! (check-liquidation loan-id btc-price) err-cant-unwrap)
    //         (if (>= payout-ratio (shift-value u1 ten-to-power-4))
    //             (ok (shift-value u1 ten-to-power-4))
    //             (ok payout-ratio))
    //         (ok u0)
    //     )
    //     )
    // )
    // )

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

    // function _findLoanIndex(string memory _uuid) private view returns (uint256) {
    //     // find the recently closed uuid index
    //     for (uint256 i = 0; i < numLoans; i++) {
    //         if (
    //             keccak256(abi.encodePacked(loans[i].dlcUUID)) ==
    //             keccak256(abi.encodePacked(_uuid))
    //         ) {
    //             return i;
    //         }
    //     }
    //     revert("Not Found"); // should not happen just in case
    // }
}
