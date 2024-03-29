const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

module.exports = async function setWhitelisting(btcFeeRecipient, version) {
    const accounts = await hardhat.ethers.getSigners();
    // NOTE: should be key_for_safe
    const admin = accounts[0];

    const tokenManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'TokenManager',
        version
    );

    const tokenManager = new hardhat.ethers.Contract(
        tokenManagerDeployInfo.contract.address,
        tokenManagerDeployInfo.contract.abi,
        admin
    );

    console.log('Setting new btc fee recipient: ', btcFeeRecipient);

    if (
        hardhat.network.name === 'localhost' ||
        (await tokenManager.hasRole(
            hardhat.ethers.utils.id('DLC_ADMIN_ROLE'),
            admin.address
        ))
    ) {
        console.log('admin has DLC_ADMIN_ROLE, setting btc fee recipient');
        const tx = await tokenManager
            .connect(admin)
            .setBtcFeeRecipient(btcFeeRecipient);
        await tx.wait();
        console.log(tx);
        return;
    } else {
        const txRequest = await tokenManager
            .connect(admin)
            .populateTransaction.setBtcFeeRecipient(btcFeeRecipient);
        await safeContractProposal(txRequest, admin);
        return;
    }
};
