const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');
const { ethers } = require('ethers');

module.exports = async function setTSSCommitment(secretIdentifier, version) {
    let secretIdentifierBytes;
    if (secretIdentifier == null) {
        secretIdentifierBytes = ethers.utils.randomBytes(32);
    } else {
        secretIdentifierBytes = ethers.utils.toUtf8Bytes(secretIdentifier);
    }

    console.log(
        'Setting TSS commitment with secret identifier: ',
        secretIdentifier
    );

    const commitment = ethers.utils.keccak256(secretIdentifierBytes);
    console.log('Commitment: ', commitment.toString());

    await callManagerContractFunction(
        'setTSSCommitment',
        [commitment],
        version
    );
};
