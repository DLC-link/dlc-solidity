const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');
const { ethers } = require('ethers');

module.exports = async function setTSSCommitment(secretIdentifier, version) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];

    const dlcManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DLCManager',
        version
    );

    const dlcManager = new hardhat.ethers.Contract(
        dlcManagerDeployInfo.contract.address,
        dlcManagerDeployInfo.contract.abi,
        admin
    );

    if (secretIdentifier == null) {
        secretIdentifier = ethers.utils.randomBytes(32);
    }
    const commitment = ethers.utils.keccak256(secretIdentifier);
    console.log(
        'Setting TSS commitment with secret identifier: ',
        secretIdentifier.toString()
    );
    console.log('Commitment: ', commitment.toString());

    if (
        hardhat.network.name === 'localhost' ||
        admin.address == (await dlcManager.defaultAdmin())
    ) {
        console.log('admin has DEFAULT_ADMIN_ROLE, setting commitment');

        await dlcManager.setTSSCommitment(commitment);
    } else {
        console.log(
            'admin does not have DEFAULT_ADMIN_ROLE, submitting multisig request...'
        );

        const txRequest = await dlcManager
            .connect(admin)
            .populateTransaction.setTSSCommitment(commitment);
        await safeContractProposal(txRequest, admin);
    }
};
