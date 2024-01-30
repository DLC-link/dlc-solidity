const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

module.exports = async function registerProtocol(
    protocolContractAddress,
    protocolWalletAddress,
    version
) {
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
        console.log('admin has DEFAULT_ADMIN_ROLE, registering protocol');

        await dlcManager.grantRole(
            hardhat.ethers.utils.id('WHITELISTED_CONTRACT'),
            protocolContractAddress
        );
        await dlcManager.grantRole(
            hardhat.ethers.utils.id('WHITELISTED_WALLET'),
            protocolWalletAddress
        );
        console.log('Protocol registered');
        console.log('Contract: ', protocolContractAddress);
        console.log('Wallet: ', protocolWalletAddress);
    } else {
        console.log(
            'admin does not have DEFAULT_ADMIN_ROLE, submitting multisig request...'
        );

        const txRequest = await dlcManager
            .connect(admin)
            .populateTransaction.grantRole(
                hardhat.ethers.utils.id('WHITELISTED_CONTRACT'),
                protocolContractAddress
            );
        await safeContractProposal(txRequest, admin);
        const txRequest2 = await dlcManager
            .connect(admin)
            .populateTransaction.grantRole(
                hardhat.ethers.utils.id('WHITELISTED_WALLET'),
                protocolWalletAddress
            );
        await safeContractProposal(txRequest2, admin);
    }
};
