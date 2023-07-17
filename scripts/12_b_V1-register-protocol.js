const hardhat = require('hardhat');
const web3 = require('web3');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function registerProtocol(
    protocolContractAddress,
    protocolWalletAddress
) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];

    const dlcManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcManager',
        'v1'
    );

    const dlcManager = new hardhat.ethers.Contract(
        dlcManagerDeployInfo.contract.address,
        dlcManagerDeployInfo.contract.abi,
        admin
    );

    await dlcManager.grantRole(
        web3.utils.soliditySha3('WHITELISTED_CONTRACT'),
        protocolContractAddress
    );
    await dlcManager.grantRole(
        web3.utils.soliditySha3('WHITELISTED_WALLET'),
        protocolWalletAddress
    );
};
