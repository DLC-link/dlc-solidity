const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function registerProtocol(
    protocolContractAddress,
    protocolWalletAddress,
    version
) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];

    const dlcManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcManager',
        version
    );

    const dlcManager = new hardhat.ethers.Contract(
        dlcManagerDeployInfo.contract.address,
        dlcManagerDeployInfo.contract.abi,
        admin
    );

    await dlcManager.grantRole(
        hardhat.ethers.utils.id('WHITELISTED_CONTRACT'),
        protocolContractAddress
    );
    await dlcManager.grantRole(
        hardhat.ethers.utils.id('WHITELISTED_WALLET'),
        protocolWalletAddress
    );
};