// // SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

// import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
// import "@openzeppelin/contracts/access/AccessControl.sol";

contract DiscreetLog {
    string[] public openUUIDs;
    uint256 _nonce = 0;

    struct DLC {
        string uuid;
        uint256 closingTime;
        int256 closingPrice;
        uint256 actualClosingTime;
        uint256 emergencyRefundTime;
        address creator;
    }
    mapping(string => DLC) public dlcs;

    constructor() {}

    function _generateUUID(address sender, uint256 nonce) private view returns (bytes32) {
        return keccak256(abi.encodePacked(sender, nonce, blockhash(block.number - 1)));
    }

    event CreateDLC(
        bytes32 uuid,
        address creator,
        uint256 emergencyRefundTime,
        string eventSource
    );

    // TODO: there is some confusion about tx.origin and msg.sender in my head.
    // We should also probably store the msg.sender, as it will be used to call back to in the post-create-dlc phase, if that is doable. Protocol contract should implement some interface (like a trait in clarity). We should store contract references on DLC creation. And call back into them during any callbacks.
    function createDLC(uint256 _emergencyRefundTime) public returns (bytes32) {
        bytes32 _uuid = _generateUUID(tx.origin, ++_nonce);
        emit CreateDLC(
            _uuid,
            msg.sender,
            _emergencyRefundTime,
            "dlclink:create-dlc:v0"
        );
        return _uuid;
    }

    event PostCreateDLC(
        string uuid,
        uint256 emergencyRefundTime,
        address creator,
        string eventSource
    );

    function postCreateDLC(
        string memory _uuid,
        uint256 _emergencyRefundTime,
        address _creator
    ) external {
        dlcs[_uuid] = DLC({
            uuid: _uuid,
            closingPrice: 0,
            closingTime: _emergencyRefundTime,
            actualClosingTime: 0,
            emergencyRefundTime: _emergencyRefundTime,
            creator: _creator
        });
        openUUIDs.push(_uuid);
        // loans[_nonce].dlcUUID = _uuid;
        // loans[_nonce].status = statuses[Status.Ready];
        emit PostCreateDLC(
            _uuid,
            _emergencyRefundTime,
            _creator,
            "dlclink:create-dlc-internal:v0"
        );
    }

    // event SetStatusFunded(string uuid, string eventSource);

    // function setStatusFunded(string memory _uuid) external {
    //     Loan storage loan = loans[_findLoanIndex(_uuid)];
    //     loan.status = statuses[Status.Funded];

    //     _usdc.transfer(loan.owner, loan.vaultLoan * (10 ** 18));
    //     emit SetStatusFunded(_uuid, "dlclink:set-status-funded:v0");
    // }

    // event CloseDLC(
    //     string uuid,
    //     int256 payoutRatio,
    //     int256 closingPrice,
    //     uint256 actualClosingTime
    // );

    // //     (define-public (repay-loan (loan-id uint))
    // //   (let (
    // //     (loan (unwrap! (get-loan loan-id) err-unknown-loan-contract))
    // //     (uuid (unwrap! (get dlcUUID loan) err-cant-unwrap))
    // //     )
    // //     (begin
    // //       (map-set loans loan-id (merge loan { status: status-pre-repaid }))
    // //       (print { uuid: uuid, status: status-pre-repaid })
    // //       (unwrap! (ok (as-contract (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.dlc-manager-loan-v0 close-dlc uuid))) err-contract-call-failed)
    // //     )
    // //   )
    // // )

    // function repayLoan(uint256 loanId) external {
    //     // User should have already called increaseAllowance to a suitable number
    //     Loan storage loan = loans[loanId];
    //     closeDlc(loan.dlcUUID);

    //     _usdc.transferFrom(loan.owner, address(this), loan.vaultLoan * (10 ** 18));
    //     loan.status = statuses[Status.Repaid];
    // }

    // function liquidateLoan(uint256 loanId) external {
    //     closeDlcLiquidate(loans[loanId].dlcUUID);
    //     loans[loanId].status = statuses[Status.Liquidated];
    // }

    // function closeDlc(string memory _uuid) public {
    //     DLC storage dlc = dlcs[_uuid];
    //     require(
    //         dlc.closingTime <= block.timestamp && dlc.actualClosingTime == 0,
    //         "Validation failed for closeDlc"
    //     );

    //     int256 payoutRatio = 0; //This is where the loan stuff goes
    //     _removeClosedDLC(_findIndex(_uuid));
    //     emit CloseDLC(_uuid, payoutRatio, 0, block.timestamp);
    // }

    // function closeDlcLiquidate(string memory _uuid) public {
    //     DLC storage dlc = dlcs[_uuid];
    //     require(
    //         dlc.closingTime <= block.timestamp && dlc.actualClosingTime == 0,
    //         "Validation failed for closeDlc"
    //     );

    //     (int256 price, uint256 timestamp) = _getLatestPrice(
    //         address(0xA39434A63A52E749F02807ae27335515BA4b07F7)
    //     );
    //     dlc.closingPrice = price;
    //     // int256 payoutRatio = dlc.strikePrice > price ? int256(0) : int256(1);
    //     int256 payoutRatio = 0; //This is where the loan stuff goes

    //     _removeClosedDLC(_findIndex(_uuid));
    //     emit CloseDLC(_uuid, payoutRatio, price, timestamp);
    // }

    // // function closingPriceAndTimeOfDLC(string memory _uuid)
    // //     external
    // //     view
    // //     returns (int256, uint256)
    // // {
    // //     DLC memory dlc = dlcs[_uuid];
    // //     require(
    // //         dlc.actualClosingTime > 0,
    // //         "The requested DLC is not closed yet"
    // //     );
    // //     return (dlc.closingPrice, dlc.actualClosingTime);
    // // }

    // // function allOpenDLC() external view returns (string[] memory) {
    // //     return openUUIDs;
    // // }

    // function _getLatestPrice(address _feedAddress)
    //     internal
    //     view
    //     returns (int256, uint256)
    // {
    //     AggregatorV3Interface priceFeed = AggregatorV3Interface(_feedAddress);
    //     (, int256 price, , uint256 timeStamp, ) = priceFeed.latestRoundData();
    //     return (price, timeStamp);
    // }

    // // note: this remove not preserving the order
    // function _removeClosedDLC(uint256 index) private returns (string[] memory) {
    //     require(index < openUUIDs.length);
    //     // Move the last element to the deleted spot
    //     openUUIDs[index] = openUUIDs[openUUIDs.length - 1];
    //     // Remove the last element
    //     openUUIDs.pop();
    //     return openUUIDs;
    // }

    // function _findIndex(string memory _uuid) private view returns (uint256) {
    //     // find the recently closed uuid index
    //     for (uint256 i = 0; i < openUUIDs.length; i++) {
    //         if (
    //             keccak256(abi.encodePacked(openUUIDs[i])) ==
    //             keccak256(abi.encodePacked(_uuid))
    //         ) {
    //             return i;
    //         }
    //     }
    //     revert("Not Found"); // should not happen just in case
    // }

    // function getAllLoansForAddress(address _addy)
    //     public
    //     view
    //     returns (Loan[] memory)
    // {
    //     Loan[] memory ownedLoans = new Loan[](loansPerAddress[_addy]);
    //     uint256 j = 0;
    //     for (uint256 i = 0; i < numLoans; i++) {
    //         if (loans[i].owner == _addy) {
    //             ownedLoans[j++] = loans[i];
    //         }
    //     }
    //     return ownedLoans;
    // }

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

    function getAllUUIDs() public view returns (string[] memory) {
        return openUUIDs;
    }
}
