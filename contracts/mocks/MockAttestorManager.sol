// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

import '@openzeppelin/contracts/access/AccessControl.sol';

contract MockAttestorManager {
    // Mapping for Attestors, key is the string and value is a boolean to check if attestor exists.
    mapping(string => bool) private _attestors;
    // Array to hold the keys of the mapping.
    string[] private _attestorKeys;

    constructor() {}

    // Function to add an Attestor. Only admin can add an Attestor.
    function addAttestor(string memory attestor) public {
        require(!_attestors[attestor], 'Attestor already exists');

        _attestors[attestor] = true;
        _attestorKeys.push(attestor);
    }

    // Function to remove an Attestor. Only admin can remove an Attestor.
    function removeAttestor(string memory attestor) public {
        require(_attestors[attestor], 'Attestor does not exist');

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

    // Function to get a specific number of random Attestors.
    function getRandomAttestors(
        uint256 number
    ) public pure returns (string[] memory) {
        string[] memory attestors = new string[](number);
        attestors[0] = 'localhost';
        attestors[1] = 'dlc.link/oracle';
        attestors[2] = 'someAttestorDomain.com';
        return attestors;
    }

    // Generates a random number.
    function randomNumber(
        uint256 salt,
        uint256 limit
    ) private view returns (uint256) {
        uint256 randomnumber = uint256(
            keccak256(abi.encodePacked(block.timestamp, msg.sender, salt))
        ) % limit;
        return randomnumber;
    }
}
