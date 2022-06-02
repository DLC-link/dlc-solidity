// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract DiscreetLog is KeeperCompatibleInterface, AccessControl {
    bytes32 public constant DLC_ADMIN_ROLE = keccak256("DLC_ADMIN_ROLE");

    string[] public openUUIDs;
    mapping(string => DLC) public dlcs;

    struct DLC {
        string UUID;
        address feedAddress;
        uint256 closingTime;
        int256 closingPrice;
        uint256 actualClosingTime;
        uint256 emergencyRefundTime;
    }

    struct PerformDataPack {
        string UUID;
        uint256 index;
    }

    event NewDLC(
        string UUID,
        address feedAddress,
        uint256 closingTime,
        uint256 emergencyRefundTime
    );
    event CloseDLC(string UUID, int256 price, uint256 actualClosingTime);
    event RequestCreateDLC(
        address feedAddress,
        uint256 closingTime,
        uint256 emergencyRefundTime,
        address caller
    );
    event EarlyCloseDLC(string UUID, int256 price, uint256 actualClosingTime);

    constructor(address _adminAddress) {
        // set the admin of the contract
        _setupRole(DLC_ADMIN_ROLE, _adminAddress);
        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles in the future if required
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function addNewDLC(
        string memory _UUID,
        address _feedAddress,
        uint256 _closingTime,
        uint256 _emergencyRefundTime
    ) external onlyRole(DLC_ADMIN_ROLE) {
        require(dlcs[_UUID].feedAddress == address(0), "DLC already added");
        require(
            _closingTime > block.timestamp,
            "Closing time can't be in the past"
        );
        dlcs[_UUID] = DLC({
            UUID: _UUID,
            feedAddress: _feedAddress,
            closingTime: _closingTime,
            closingPrice: 0,
            actualClosingTime: 0,
            emergencyRefundTime: _emergencyRefundTime
        });
        openUUIDs.push(_UUID);
        emit NewDLC(_UUID, _feedAddress, _closingTime, _emergencyRefundTime);
    }

    function requestCreateDLC(
        address _feedAddress,
        uint256 _closingTime,
        uint256 _emergencyRefundTime
    ) external {
        require(
            _closingTime > block.timestamp,
            "Closing time can't be in the past"
        );
        emit RequestCreateDLC(
            _feedAddress,
            _closingTime,
            _emergencyRefundTime,
            msg.sender
        );
    }

    function cancelEarly(string memory _UUID)
        external
        onlyRole(DLC_ADMIN_ROLE)
        returns (int256)
    {
        DLC storage dlc = dlcs[_UUID];
        require(
            block.timestamp < dlc.closingTime,
            "Can only be called before the closing time"
        );
        require(
            dlc.actualClosingTime == 0,
            "Can only be called if the DLC has not been closed yet"
        );

        (int256 price, uint256 timeStamp) = getLatestPrice(dlc.feedAddress);
        dlc.closingPrice = price;
        dlc.actualClosingTime = timeStamp;
        removeClosedDLC(findIndex(_UUID));
        emit EarlyCloseDLC(_UUID, price, timeStamp);
        return price;
    }

    // called by ChainLink Keepers (off-chain simulation, so no gas cost)
    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        for (uint256 i = 0; i < openUUIDs.length; i++) {
            DLC memory dlc = dlcs[openUUIDs[i]];
            if (
                dlc.closingTime <= block.timestamp && dlc.actualClosingTime == 0
            ) {
                // only perform upkeep if closingTime passed and DLC not closed yet
                upkeepNeeded = true;
                performData = abi.encode(
                    PerformDataPack({
                        UUID: openUUIDs[i],
                        index: findIndex(openUUIDs[i]) // finding the index in off-chain simulation to save gas
                    })
                );
                break;
            }
        }
    }

    // called by ChainLink Keepers if upkeepNeeded evaluates to true in checkUpKeep
    function performUpkeep(bytes calldata performData) external override {
        PerformDataPack memory pdp = abi.decode(performData, (PerformDataPack));
        DLC storage dlc = dlcs[pdp.UUID];

        //validate again as recommended in the docs, also since upKeeps can run in parallel it can happen
        //that a DLC which is being closed gets picked up by the checkUpKeep so we can revert here
        require(
            dlc.closingTime <= block.timestamp && dlc.actualClosingTime == 0,
            string(
                abi.encodePacked(
                    "Validation failed for performUpKeep for UUID: ",
                    string(abi.encodePacked(pdp.UUID))
                )
            )
        );

        (int256 price, uint256 timeStamp) = getLatestPrice(dlc.feedAddress);
        dlc.closingPrice = price;
        dlc.actualClosingTime = timeStamp;
        removeClosedDLC(pdp.index);
        emit CloseDLC(pdp.UUID, price, timeStamp);
    }

    function closingPriceAndTimeOfDLC(string memory _UUID)
        external
        view
        returns (int256, uint256)
    {
        DLC memory dlc = dlcs[_UUID];
        require(
            dlc.actualClosingTime > 0,
            "The requested DLC is not closed yet"
        );
        return (dlc.closingPrice, dlc.actualClosingTime);
    }

    function allOpenDLC() external view returns (string[] memory) {
        return openUUIDs;
    }

    function getLatestPrice(address _feedAddress)
        internal
        view
        returns (int256, uint256)
    {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(_feedAddress);
        (, int256 price, , uint256 timeStamp, ) = priceFeed.latestRoundData();
        return (price, timeStamp);
    }

    // note: this remove not preserving the order
    function removeClosedDLC(uint256 index) private returns (string[] memory) {
        require(index < openUUIDs.length);
        // Move the last element to the deleted spot
        openUUIDs[index] = openUUIDs[openUUIDs.length - 1];
        // Remove the last element
        openUUIDs.pop();
        return openUUIDs;
    }

    function findIndex(string memory _UUID) private view returns (uint256) {
        // find the recently closed UUID index
        for (uint256 i = 0; i < openUUIDs.length; i++) {
            if (
                keccak256(abi.encodePacked(openUUIDs[i])) ==
                keccak256(abi.encodePacked(_UUID))
            ) {
                return i;
            }
        }
        revert("Not Found"); // should not happen just in case
    }
}
