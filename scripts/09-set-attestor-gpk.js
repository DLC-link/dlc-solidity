const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

module.exports = async function setAttestorGroupPubKey(attestorGPK, version) {
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

    if (
        hardhat.network.name === 'localhost' ||
        admin.address == (await dlcManager.defaultAdmin())
    ) {
        console.log('admin has DEFAULT_ADMIN_ROLE, setting attestorGPK');

        const tx = await dlcManager.setAttestorGroupPubKey(attestorGPK);
        await tx.wait();

        console.log('Changed to: ', await dlcManager.attestorGroupPubKey());
    } else {
        console.log(
            'admin does not have DEFAULT_ADMIN_ROLE, submitting multisig request...'
        );

        const txRequest = await dlcManager
            .connect(admin)
            .populateTransaction.setAttestorGroupPubKey(attestorGPK);
        await safeContractProposal(txRequest, admin);
    }
};
