// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./DiscreetLog.sol";

enum Status {
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
    string status;
    uint256 vaultLoan; // the borrowed amount
    uint256 vaultCollateral; // btc deposit in sats
    uint256 liquidationRatio; // the collateral/loan ratio below which liquidation can happen, with two decimals precision (140% = u14000)
    uint256 liquidationFee; // additional fee taken during liquidation, two decimals precision (10% = u1000)
    uint256 closingPrice; // In case of liquidation, the closing BTC price will be stored here
    address owner; // the stacks account owning this loan
}

contract ProtocolContract {
    DiscreetLog private _dlcManager = new DiscreetLog();

    IERC20 private _usdc = IERC20(0x88B21d13E5d8E40109Ebaa00204C9868441710Fd);

    uint256 public numLoans = 0;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256) public loansPerAddress;

    Status public status;
    mapping(Status => string) public statuses;

    constructor() {
      statuses[Status.NotReady] = "not-ready";
      statuses[Status.Ready] = "ready";
      statuses[Status.Funded] = "funded";
      statuses[Status.PreRepaid] = "pre-repaid";
      statuses[Status.Repaid] = "repaid";
      statuses[Status.PreLiquidated] = "pre-liquidated";
      statuses[Status.Liquidated] = "liquidated";
    }

    function setupLoan(
        uint256 vaultLoanAmount,
        uint256 btcDeposit,
        uint256 liquidationRatio,
        uint256 liquidationFee,
        uint256 emergencyRefundTime
    ) external returns (uint256) {

        bytes32 _uuid = _dlcManager.createDLC(emergencyRefundTime);

        loans[numLoans] = Loan({
            id: numLoans,
            dlcUUID: _uuid,
            status: statuses[Status.NotReady],
            vaultLoan: vaultLoanAmount,
            vaultCollateral: btcDeposit,
            liquidationRatio: liquidationRatio,
            liquidationFee: liquidationFee,
            closingPrice: 0,
            owner: msg.sender
        });

        loansPerAddress[msg.sender]++;
        numLoans++;

        return (numLoans - 1);
    }

}
