// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

// import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import './DLCLinkCompatibleV1.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import './AttestorManager.sol';

enum Status {
    REQUESTED,
    CREATED,
    FUNDED,
    CLOSING,
    CLOSED
}

struct DLC {
    bytes32 uuid;
    string[] attestorList;
    address protocolWallet;
    address creator;
    uint256 outcome;
    Status status;
}

contract DLCManagerV1 is AccessControl {
    AttestorManager private _attestorManager;
    uint256 private _localNonce = 0;
    mapping(bytes32 => DLC) public dlcs;

    bytes32 public constant DLC_ADMIN_ROLE = keccak256('DLC_ADMIN_ROLE');
    bytes32 public constant WHITELISTED_CONTRACT =
        keccak256('WHITELISTED_CONTRACT');
    bytes32 public constant WHITELISTED_WALLET =
        keccak256('WHITELISTED_WALLET');
    // bytes32[] public openUUIDs;

    modifier onlyAdmin() {
        require(hasRole(DLC_ADMIN_ROLE, msg.sender), 'Unathorized');
        _;
    }

    modifier onlyWhiteListedContracts() {
        require(
            hasRole(WHITELISTED_CONTRACT, msg.sender),
            'Only whitelisted contracts can call this function'
        );
        _;
    }

    modifier onlyWhitelistedAndConnectedWallet(bytes32 _uuid) {
        require(
            hasRole(WHITELISTED_WALLET, msg.sender),
            'Only whitelisted wallets can call this function'
        );
        require(dlcs[_uuid].protocolWallet == msg.sender, 'Unathorized');
        _;
    }

    constructor(address _adminAddress, address _attestorManagerAddress) {
        // Grant the contract deployer the default admin role
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // set the admin of the contract
        _setupRole(DLC_ADMIN_ROLE, _adminAddress);

        _attestorManager = AttestorManager(_attestorManagerAddress);
    }

    function _generateUUID(
        address sender,
        uint256 nonce
    ) private view returns (bytes32) {
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
        string[] attestorList,
        address creator,
        address protocolWallet,
        string eventSource
    );

    // Default value for _attestorCount is 3
    function createDLC(
        address _protocolWallet
    ) external onlyWhiteListedContracts returns (bytes32, string[] memory) {
        return this.createDLC(_protocolWallet, 3);
    }

    function createDLC(
        address _protocolWallet,
        uint8 _attestorCount
    ) external onlyWhiteListedContracts returns (bytes32, string[] memory) {
        require(
            hasRole(WHITELISTED_WALLET, _protocolWallet),
            'Unathorized Wallet Address'
        );
        bytes32 _uuid = _generateUUID(tx.origin, ++_localNonce);
        string[] memory _attestorList = _attestorManager.getRandomAttestors(
            _attestorCount
        );
        dlcs[_uuid] = DLC({
            uuid: _uuid,
            attestorList: _attestorList,
            protocolWallet: _protocolWallet,
            creator: msg.sender,
            outcome: 0,
            status: Status.REQUESTED
        });
        emit CreateDLC(
            _uuid,
            _attestorList,
            msg.sender,
            _protocolWallet,
            'dlclink:create-dlc:v1'
        );
        return (_uuid, _attestorList);
    }

    function _updateStatus(
        bytes32 _uuid,
        Status _currentStatus,
        Status _status
    ) private returns (bool) {
        require(
            dlcs[_uuid].status == _currentStatus,
            'Invalid Status Transition'
        );
        dlcs[_uuid].status = _status;
        return true;
    }

    event PostCreateDLC(
        bytes32 uuid,
        address creator,
        address protocolWallet,
        address sender,
        string eventSource
    );

    function postCreateDLC(
        bytes32 _uuid
    ) external onlyWhitelistedAndConnectedWallet(_uuid) {
        _updateStatus(_uuid, Status.REQUESTED, Status.CREATED);
        DLCLinkCompatibleV1(dlcs[_uuid].creator).postCreateDLCHandler(_uuid);
        emit PostCreateDLC(
            _uuid,
            dlcs[_uuid].creator,
            dlcs[_uuid].protocolWallet,
            msg.sender,
            'dlclink:post-create-dlc:v1'
        );
    }

    event SetStatusFunded(
        bytes32 uuid,
        address creator,
        address protocolWallet,
        address sender,
        string eventSource
    );

    function setStatusFunded(
        bytes32 _uuid
    ) external onlyWhitelistedAndConnectedWallet(_uuid) {
        _updateStatus(_uuid, Status.CREATED, Status.FUNDED);
        DLCLinkCompatibleV1(dlcs[_uuid].creator).setStatusFunded(_uuid);
        emit SetStatusFunded(
            _uuid,
            dlcs[_uuid].creator,
            dlcs[_uuid].protocolWallet,
            msg.sender,
            'dlclink:set-status-funded:v1'
        );
    }

    event CloseDLC(
        bytes32 uuid,
        uint256 outcome,
        address creator,
        address protocolWallet,
        address sender,
        string eventSource
    );

    function closeDLC(
        bytes32 _uuid,
        uint256 _outcome
    ) external onlyWhiteListedContracts {
        _updateStatus(_uuid, Status.FUNDED, Status.CLOSING);
        emit CloseDLC(
            _uuid,
            _outcome,
            dlcs[_uuid].creator,
            dlcs[_uuid].protocolWallet,
            msg.sender,
            'dlclink:close-dlc:v1'
        );
    }

    event PostCloseDLC(
        bytes32 uuid,
        uint256 outcome,
        address creator,
        address protocolWallet,
        address sender,
        string eventSource
    );

    function postCloseDLC(
        bytes32 _uuid,
        uint256 _outcome
    ) external onlyWhitelistedAndConnectedWallet(_uuid) {
        _updateStatus(_uuid, Status.CLOSING, Status.CLOSED);
        dlcs[_uuid].outcome = _outcome;
        DLCLinkCompatibleV1(dlcs[_uuid].creator).postCloseDLCHandler(_uuid);
        emit PostCloseDLC(
            _uuid,
            _outcome,
            dlcs[_uuid].creator,
            dlcs[_uuid].protocolWallet,
            msg.sender,
            'dlclink:post-close-dlc:v1'
        );
    }

    // note: this remove not preserving the order
    // function _removeClosedDLC(
    //     uint256 index
    // ) private returns (bytes32[] memory) {
    //     require(index < openUUIDs.length);
    //     // Move the last element to the deleted spot
    //     openUUIDs[index] = openUUIDs[openUUIDs.length - 1];
    //     // Remove the last element
    //     openUUIDs.pop();
    //     return openUUIDs;
    // }

    // function _findIndex(bytes32 _uuid) private view returns (uint256) {
    //     // find the recently closed uuid index
    //     for (uint256 i = 0; i < openUUIDs.length; i++) {
    //         if (
    //             keccak256(abi.encodePacked(openUUIDs[i])) ==
    //             keccak256(abi.encodePacked(_uuid))
    //         ) {
    //             return i;
    //         }
    //     }
    //     revert('DLC Not Found');
    // }

    // function getAllUUIDs() public view returns (bytes32[] memory) {
    //     return openUUIDs;
    // }
}
