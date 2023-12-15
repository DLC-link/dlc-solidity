const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function burnUserTokens(address) {
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'TokenManager',
        'v1'
    );
    const accounts = await hardhat.ethers.getSigners();

    const tokenManager = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );

    const tx = await tokenManager.burnUserTokens(address);
    const receipt = await tx.wait();
    console.dir(receipt, { depth: 4 });
};
