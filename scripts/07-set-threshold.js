const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

module.exports = async function setThreshold(threshold, version) {
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
        console.log('admin has DEFAULT_ADMIN_ROLE, setting threshold');

        await dlcManager.setThreshold(threshold);

        console.log('Changed to: ', threshold);
    } else {
        console.log(
            'admin does not have DEFAULT_ADMIN_ROLE, submitting multisig request...'
        );

        const txRequest = await dlcManager
            .connect(admin)
            .populateTransaction.setThreshold(threshold);
        await safeContractProposal(txRequest, admin);
    }
};
