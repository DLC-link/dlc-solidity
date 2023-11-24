const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function tokenManagerSetupVault(
    btcDeposit = 1000000,
    version = 'v1'
) {
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'TokenManager',
        version
    );
    const accounts = await hardhat.ethers.getSigners();

    const tokenManager = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );

    const tx = await tokenManager.setupVault(btcDeposit);
    const receipt = await tx.wait();
    console.dir(tx, { depth: 4 });
    console.dir(receipt, { depth: 4 });
};
