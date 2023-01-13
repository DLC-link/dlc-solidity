// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./DiscreetLog.sol";
import "./DLCLinkCompatible.sol";

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

contract ProtocolContract is DLCLinkCompatible {
    DiscreetLog private _dlcManager = new DiscreetLog();
    IERC20 private _usdc;

    uint256 public numLoans = 0;
    mapping(uint256 => Loan) public loans;
    mapping(bytes32 => uint256) public loanIDsByUUID;
    mapping(address => uint256) public loansPerAddress;

    constructor(address _usdcAddress) {
      _usdc = IERC20(_usdcAddress);
    }

    event StatusUpdate(
      Status previousStatus,
      Status newStatus
    );

    event SetupLoan(
        bytes32 dlcUUID,
        uint256 btcDeposit,
        uint256 liquidationRatio,
        uint256 liquidationFee,
        uint256 emergencyRefundTime,
        uint256 numLoans,
        address owner
    );

    function setupLoan(
        uint256 btcDeposit,
        uint256 liquidationRatio,
        uint256 liquidationFee,
        uint256 emergencyRefundTime
    ) external returns (uint256) {
        // Calling the dlc-manager contract & getting a uuid
        bytes32 _uuid = _dlcManager.createDLC(emergencyRefundTime, numLoans);

        loans[numLoans] = Loan({
            id: numLoans,
            dlcUUID: _uuid,
            status: Status.NotReady,
            vaultLoan: 0,
            vaultCollateral: btcDeposit,
            liquidationRatio: liquidationRatio,
            liquidationFee: liquidationFee,
            closingPrice: 0,
            owner: msg.sender
        });

        loanIDsByUUID[_uuid] = numLoans;

        emit SetupLoan(
            _uuid,
            btcDeposit,
            liquidationRatio,
            liquidationFee,
            emergencyRefundTime,
            numLoans,
            msg.sender
        );

        emit StatusUpdate(Status.None, Status.NotReady);

        loansPerAddress[msg.sender]++;
        numLoans++;

        return (numLoans - 1);
    }

    function postCreateDLCHandler(bytes32 _uuid) public {
        require(loans[loanIDsByUUID[_uuid]].dlcUUID != 0, "No such loan");
        require(loans[loanIDsByUUID[_uuid]].status != Status.Ready, "Loan is already ready");

        emit StatusUpdate(loans[loanIDsByUUID[_uuid]].status, Status.Ready);
        loans[loanIDsByUUID[_uuid]].status = Status.Ready;
    }

    function setStatusFunded(bytes32 _uuid) public {
        require(loans[loanIDsByUUID[_uuid]].dlcUUID != 0, "No such loan");
        require(loans[loanIDsByUUID[_uuid]].status != Status.Funded, "Loan is already funded");

        emit StatusUpdate(loans[loanIDsByUUID[_uuid]].status, Status.Funded);
        loans[loanIDsByUUID[_uuid]].status = Status.Funded;
    }

    function getLoan(uint256 _nonce) public view returns(Loan memory) {
        return loans[_nonce];
    }

    function getLoanByUUID(bytes32 _uuid) public view returns(Loan memory) {
        return loans[loanIDsByUUID[_uuid]];
    }

}
