// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract AttestorManager is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Mapping for Attestors, key is the string and value is a boolean to check if attestor exists.
    mapping(string => bool) private _attestors;
    // Array to hold the keys of the mapping.
    string[] private _attestorKeys;

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
    }

    modifier onlyAdmin() {
        require(
            hasRole(ADMIN_ROLE, _msgSender()),
            "AttestorManager: must have admin role to perform this action"
        );
        _;
    }

    // Function to add a new Attestor.
    // It must start with 'https://' or 'http://'.
    function addAttestor(string memory attestor) public onlyAdmin {
        require(!_attestors[attestor], "Attestor already exists");

        _attestors[attestor] = true;
        _attestorKeys.push(attestor);
    }

    // Function to remove an Attestor. Only admin can remove an Attestor.
    function removeAttestor(string memory attestor) public onlyAdmin {
        require(_attestors[attestor], "Attestor does not exist");

        _attestors[attestor] = false;

        // Find the attestor in the array and remove it.
        for (uint256 i = 0; i < _attestorKeys.length; i++) {
            if (
                keccak256(abi.encodePacked(_attestorKeys[i])) ==
                keccak256(abi.encodePacked(attestor))
            ) {
                _attestorKeys[i] = _attestorKeys[_attestorKeys.length - 1];
                _attestorKeys.pop();
                break;
            }
        }
    }

    // Function to check if an Attestor exists.
    function isAttestor(string memory attestor) public view returns (bool) {
        return _attestors[attestor];
    }

    function getAllAttestors() public view returns (string[] memory) {
        return _attestorKeys;
    }

    // Function to get a specific number of random Attestors.
    function getRandomAttestors(
        uint256 number
    ) public view returns (string[] memory) {
        require(number <= _attestorKeys.length, "Not enough Attestors");

        string[] memory tempKeys = new string[](_attestorKeys.length);
        for (uint256 i = 0; i < _attestorKeys.length; i++) {
            tempKeys[i] = _attestorKeys[i];
        }

        string[] memory selectedAttestors = new string[](number);
        for (uint256 i = 0; i < number; i++) {
            uint256 randomIndex = _randomNumber(i, tempKeys.length - i);

            // Move the selected key to the selected attestors array
            selectedAttestors[i] = tempKeys[randomIndex];

            // Move the last key in tempKeys to the selected index
            tempKeys[randomIndex] = tempKeys[tempKeys.length - i - 1];
        }

        return selectedAttestors;
    }

    // Generates a random number.
    function _randomNumber(
        uint256 salt,
        uint256 limit
    ) private view returns (uint256) {
        uint256 randomnumber = uint256(
            keccak256(abi.encodePacked(block.timestamp, msg.sender, salt))
        ) % limit;
        return randomnumber;
    }
}
