// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

// import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./DLCLinkCompatible.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract DLCManager is AccessControl {
    bytes32 public constant DLC_ADMIN_ROLE = keccak256("DLC_ADMIN_ROLE");
    bytes32[] public openUUIDs;
    uint256 private _localNonce = 0;
    address public btcPriceFeedAddress;

    struct DLC {
        bytes32 uuid;
        uint256 emergencyRefundTime;
        address creator;
        uint256 outcome;
        uint256 nonce;
    }
    mapping(bytes32 => DLC) public dlcs;

    constructor(address _adminAddress, address _btcPriceFeedAddress) {
        // set the admin of the contract
        _setupRole(DLC_ADMIN_ROLE, _adminAddress);
        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles in the future if required
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        btcPriceFeedAddress = _btcPriceFeedAddress;
    }

    function _generateUUID(address sender, uint256 nonce)
        private
        view
        returns (bytes32)
    {
        return
            keccak256(
                abi.encodePacked(sender, nonce, blockhash(block.number - 1))
            );
    }

    function getDLC(bytes32 _uuid) public view returns (DLC memory) {
        return dlcs[_uuid];
    }

    event CreateDLC(
        bytes32 uuid,
        address creator,
        uint256 emergencyRefundTime,
        uint256 nonce,
        string eventSource
    );

    // NOTE: creator (msg.sender) must be a DLCLinkCompatible contract. tx.origin can be a user address
    function createDLC(uint256 _emergencyRefundTime, uint256 _nonce)
        public
        returns (bytes32)
    {
        // We cap ERT in about 3110 years just to be safe
        require(
            _emergencyRefundTime < 99999999999,
            "Emergency Refund Time is too high"
        );

        bytes32 _uuid = _generateUUID(tx.origin, ++_localNonce);
        emit CreateDLC(
            _uuid,
            msg.sender,
            _emergencyRefundTime,
            _nonce,
            "dlclink:create-dlc:v0"
        );
        return _uuid;
    }

    event PostCreateDLC(
        bytes32 uuid,
        address creator,
        uint256 emergencyRefundTime,
        uint256 nonce,
        string eventSource
    );

    function postCreateDLC(
        bytes32 _uuid,
        uint256 _emergencyRefundTime,
        uint256 _nonce,
        address _creator
    ) external onlyRole(DLC_ADMIN_ROLE) {
        dlcs[_uuid] = DLC({
            uuid: _uuid,
            emergencyRefundTime: _emergencyRefundTime,
            nonce: _nonce,
            outcome: 0,
            creator: _creator
        });
        openUUIDs.push(_uuid);
        DLCLinkCompatible(_creator).postCreateDLCHandler(_uuid);
        emit PostCreateDLC(
            _uuid,
            _creator,
            _emergencyRefundTime,
            _nonce,
            "dlclink:post-create-dlc:v0"
        );
    }

    event SetStatusFunded(bytes32 uuid, string eventSource);

    function setStatusFunded(bytes32 _uuid) external onlyRole(DLC_ADMIN_ROLE) {
        DLCLinkCompatible(dlcs[_uuid].creator).setStatusFunded(_uuid);
        emit SetStatusFunded(_uuid, "dlclink:set-status-funded:v0");
    }

    event CloseDLC(
        bytes32 uuid,
        uint256 outcome,
        address creator,
        string eventSource
    );

    function closeDLC(bytes32 _uuid, uint256 _outcome) public {
        // Access control?
        DLC storage _dlc = dlcs[_uuid];
        require(_dlc.uuid != 0, "Unknown DLC");
        _dlc.outcome = _outcome; // Saving requested outcome
        emit CloseDLC(
            _uuid,
            _outcome,
            dlcs[_uuid].creator,
            "dlclink:close-dlc:v0"
        );
    }

    event PostCloseDLC(
        bytes32 uuid,
        uint256 outcome,
        uint256 actualClosingTime,
        string eventSource
    );

    function postCloseDLC(bytes32 _uuid, uint256 _oracleOutcome)
        external
        onlyRole(DLC_ADMIN_ROLE)
    {
        DLC storage _dlc = dlcs[_uuid];
        require(_dlc.uuid != 0, "Unknown DLC");
        require(_dlc.outcome == _oracleOutcome, "Different Outcomes");

        _removeClosedDLC(_findIndex(_uuid));
        DLCLinkCompatible(_dlc.creator).postCloseDLCHandler(_uuid);
        emit PostCloseDLC(
            _uuid,
            _oracleOutcome,
            block.timestamp,
            "dlclink:post-close-dlc:v0"
        );
    }

    event BTCPriceFetching(
        bytes32 uuid,
        address caller,
        int256 price,
        string eventSource
    );

    function getBTCPriceWithCallback(bytes32 _uuid) external returns (int256) {
        (int256 price, uint256 timestamp) = _getLatestPrice(
            btcPriceFeedAddress
        );
        DLCLinkCompatible(dlcs[_uuid].creator).getBtcPriceCallback(
            _uuid,
            price,
            timestamp
        );
        emit BTCPriceFetching(
            _uuid,
            msg.sender,
            price,
            "dlc-link:get-btc-price-with-callback:v0"
        );
        return price;
    }

    // Gives back BTC price data. 8 decimals, e.g. $22,836 = 2283600000000
    function _getLatestPrice(address _feedAddress)
        internal
        view
        returns (int256, uint256)
    {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(_feedAddress);
        (, int256 price, , uint256 timeStamp, ) = priceFeed.latestRoundData();
        return (price, timeStamp);
    }

    // note: this remove not preserving the order
    function _removeClosedDLC(uint256 index)
        private
        returns (bytes32[] memory)
    {
        require(index < openUUIDs.length);
        // Move the last element to the deleted spot
        openUUIDs[index] = openUUIDs[openUUIDs.length - 1];
        // Remove the last element
        openUUIDs.pop();
        return openUUIDs;
    }

    function _findIndex(bytes32 _uuid) private view returns (uint256) {
        // find the recently closed uuid index
        for (uint256 i = 0; i < openUUIDs.length; i++) {
            if (
                keccak256(abi.encodePacked(openUUIDs[i])) ==
                keccak256(abi.encodePacked(_uuid))
            ) {
                return i;
            }
        }
        revert("Not Found"); // should not happen just in case
    }

    function getAllUUIDs() public view returns (bytes32[] memory) {
        return openUUIDs;
    }
}
