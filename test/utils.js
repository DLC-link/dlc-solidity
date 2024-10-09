const { ethers } = require('hardhat');
const crypto = require('crypto');
const secp256k1 = require('secp256k1');

async function getSignatures(message, attestors, numberOfSignatures) {
    const hashedOriginalMessage = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'string', 'string', 'uint256'],
            [
                message.uuid,
                message.btcTxId,
                message.functionString,
                message.newLockedAmount,
            ]
        )
    );

    let signatureBytes = [];
    for (let i = 0; i < numberOfSignatures; i++) {
        const sig = await attestors[i].signMessage(
            ethers.utils.arrayify(hashedOriginalMessage)
        );
        signatureBytes.push(ethers.utils.arrayify(sig));
    }
    // Convert signatures from strings to bytes
    return signatureBytes;
}

async function setSigners(dlcManager, attestors) {
    for (let i = 0; i < attestors.length; i++) {
        await dlcManager.grantRole(
            ethers.utils.id('APPROVED_SIGNER'),
            attestors[i].address
        );
    }
}

function signMessageCustom(privateKey, messageHash, nonce) {
    // Prepend the Ethereum signed message prefix
    const prefixBytes = ethers.utils.toUtf8Bytes(
        '\x19Ethereum Signed Message:\n32'
    );
    const prefixedMessageBytes = new Uint8Array(
        prefixBytes.length + messageHash.length
    );
    prefixedMessageBytes.set(prefixBytes);
    prefixedMessageBytes.set(messageHash, prefixBytes.length);

    // Hash the prefixed message
    const prefixedMessageHash = ethers.utils.keccak256(prefixedMessageBytes);
    const prefixedMessageHashBytes = ethers.utils.arrayify(prefixedMessageHash);

    const signature = secp256k1.ecdsaSign(
        prefixedMessageHashBytes,
        privateKey,
        { noncefn: () => nonce }
    );
    return ethers.utils.joinSignature({
        r: '0x' + Buffer.from(signature.signature.slice(0, 32)).toString('hex'),
        s:
            '0x' +
            Buffer.from(signature.signature.slice(32, 64)).toString('hex'),
        v: signature.recid + 27,
    });
}

async function getMultipleSignaturesForSameAttestorAndMessage(
    message,
    attestor,
    numberOfSignatures
) {
    const hashedOriginalMessage = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'string', 'string', 'uint256'],
            [
                message.uuid,
                message.btcTxId,
                message.functionString,
                message.newLockedAmount,
            ]
        )
    );

    let signatureBytes = [];
    for (let i = 0; i < numberOfSignatures; i++) {
        const randomNonce = crypto.randomBytes(32);
        const sig = await signMessageCustom(
            ethers.utils.arrayify(attestor.privateKey),
            ethers.utils.arrayify(hashedOriginalMessage),
            randomNonce
        );
        signatureBytes.push(ethers.utils.arrayify(sig));
    }
    // Convert signatures from strings to bytes
    return signatureBytes;
}

module.exports = {
    getSignatures,
    setSigners,
    getMultipleSignaturesForSameAttestorAndMessage,
};
