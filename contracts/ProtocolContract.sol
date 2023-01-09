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

contract ProtocolContract is DLCLinkCompatible {
    DiscreetLog private _dlcManager = new DiscreetLog();
    IERC20 private _usdc = IERC20(0x88B21d13E5d8E40109Ebaa00204C9868441710Fd);

    uint256 public numLoans = 0;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256) public loansPerAddress;

    constructor() {}

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

    function postCreateDLCHandler(uint256 _nonce) public {
      require(loans[_nonce].dlcUUID != 0, "Invalid loan nonce");
      require(loans[_nonce].status != Status.Ready, "Loan is already ready");

      emit StatusUpdate(loans[_nonce].status, Status.Ready);
      loans[_nonce].status = Status.Ready;
    }

    function getLoan(uint256 _nonce) public view returns(Loan memory) {
      return loans[_nonce];
    }

}
