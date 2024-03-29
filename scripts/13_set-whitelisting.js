const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

module.exports = async function setWhitelisting(whitelistingEnabled, version) {
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

    // NOTE: FIXME: TODO: it deosn't matter what this is, you have to send the boolean value
    console.log('Whitelisting: ', whitelistingEnabled);

    if (
        hardhat.network.name === 'localhost' ||
        (await tokenManager.hasRole(
            hardhat.ethers.utils.id('DLC_ADMIN_ROLE'),
            admin.address
        ))
    ) {
        console.log('admin has DLC_ADMIN_ROLE, toggling whitelisting');
        const tx = await tokenManager
            .connect(admin)
            .setWhitelistingEnabled(false);
        const receipt = await tx.wait();
        console.log(receipt);
        return;
    } else {
        const txRequest = await tokenManager
            .connect(admin)
            .populateTransaction.setWhitelistingEnabled(false);
        await safeContractProposal(txRequest, admin);
        return;
    }
};
