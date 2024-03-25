const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

module.exports = async function addSigner(signer, version) {
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
        console.log('admin has DEFAULT_ADMIN_ROLE, adding signer');

        await dlcManager.grantRole(
            hardhat.ethers.utils.id('APPROVED_SIGNER'),
            signer
        );

        console.log('Added: ', signer);
    } else {
        console.log(
            'admin does not have DEFAULT_ADMIN_ROLE, submitting multisig request...'
        );

        const txRequest = await dlcManager
            .connect(admin)
            .populateTransaction.grantRole(
                hardhat.ethers.utils.id('APPROVED_SIGNER'),
                signer
            );
        await safeContractProposal(txRequest, admin);
    }
};
