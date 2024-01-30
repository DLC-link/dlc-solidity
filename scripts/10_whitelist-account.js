const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

module.exports = async function whitelistAccount(addressToWhitelist, version) {
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

    console.log('Whitelisting address: ', addressToWhitelist);

    if (
        hardhat.network.name === 'localhost' ||
        (await tokenManager.hasRole(
            hardhat.ethers.utils.id('DLC_ADMIN_ROLE'),
            admin.address
        ))
    ) {
        console.log('admin has DLC_ADMIN_ROLE, whitelisting address');
        const tx = await tokenManager
            .connect(admin)
            .whitelistAddress(addressToWhitelist);
        await tx.wait();
        console.log(tx);
        return;
    } else {
        const txRequest = await tokenManager
            .connect(admin)
            .populateTransaction.whitelistAddress(addressToWhitelist);
        await safeContractProposal(txRequest, admin);
        return;
    }
};
