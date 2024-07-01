const { ethers } = require('hardhat');

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
    return { signatureBytes };
}

async function setSigners(dlcManager, attestors) {
    for (let i = 0; i < attestors.length; i++) {
        await dlcManager.grantRole(
            ethers.utils.id('APPROVED_SIGNER'),
            attestors[i].address
        );
    }
}

module.exports = { getSignatures, setSigners };
