// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// This is a contract used for testing the threshold signature scheme
// It is not meant to be used in production
// To be deleted
contract ThresholdSignature {
    uint256 public threshold;
    mapping(address => bool) public signers;
    mapping(bytes32 => uint256) public signatureCounts;

    constructor(uint256 _threshold, address[] memory _signers) {
        require(
            _threshold <= _signers.length,
            "Threshold cannot be larger than the number of signers"
        );
        threshold = _threshold;

        for (uint256 i = 0; i < _signers.length; i++) {
            signers[_signers[i]] = true;
        }
    }

    function execute(
        bytes32 _uuid,
        string memory _btxTxId,
        bytes32 _hash,
        bytes[] memory _signatures
    ) public {
        // bytes memory originalMessage = abi.encodePacked(_uuid, _btxTxId);
        // console.log("Original Message:");
        // console.logBytes(originalMessage);
        // bytes32 hashedOriginalMessage = keccak256(
        //     abi.encodePacked(originalMessage)
        // );

        // bytes32 hashedOriginalMessage = keccak256(
        //     abi.encodePacked(_uuid, _btxTxId)
        // );

        // console.log("Hashed Original Message:");
        // console.logBytes32(hashedOriginalMessage);
        bytes32 _prefixedMessageHash = ECDSA.toEthSignedMessageHash(
            keccak256(abi.encodePacked(_uuid, _btxTxId))
        );
        console.log("Prefixed Message Hash:");
        console.logBytes32(_prefixedMessageHash);

        require(
            _hash == _prefixedMessageHash,
            "Hash does not match the expected hash"
        );
        require(_signatures.length >= threshold, "Not enough signatures");
        bytes32 signedMessage = ECDSA.toEthSignedMessageHash(_hash);
        console.log("Signed Message:");
        console.logBytes32(signedMessage);
        for (uint256 i = 0; i < _signatures.length; i++) {
            // console.log("Signature");
            // console.logBytes(_signatures[i]);
            // address recovered = _recoverSigner(_hash, _signatures[i]);
            address recovered = ECDSA.recover(signedMessage, _signatures[i]);
            // console.log("Recovered Address:");
            // console.logAddress(recovered);
            require(
                signers[recovered],
                "Signature not from an approved signer"
            );

            // Prevent a signer from signing the same message multiple times
            bytes32 signedHash = keccak256(
                abi.encodePacked(signedMessage, recovered)
            );
            // console.logBytes32(signedHash);
            require(signatureCounts[signedHash] == 0, "Duplicate signature");
            signatureCounts[signedHash] = 1;
        }

        // Execute the function
        // ...
        console.log("Function executed");
    }

    // function _recoverSigner(bytes32 _hash, bytes memory _signature) internal pure returns (address) {
    //     bytes32 prefixedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash));
    //     (bytes32 r, bytes32 s, uint8 v) = _splitSignature(_signature);
    //     return ecrecover(prefixedHash, v, r, s);
    // }

    // function _splitSignature(bytes memory _signature) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
    //     require(_signature.length == 65, "Invalid signature length");

    //     assembly {
    //         r := mload(add(_signature, 32))
    //         s := mload(add(_signature, 64))
    //         v := byte(0, mload(add(_signature, 96)))
    //     }
    // }
}
