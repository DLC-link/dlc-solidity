const { task, types } = require('hardhat/config');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

async function dlcManagerSetupVault(btcDeposit, hardhat) {
    if (!hardhat || !hardhat.network) hardhat = require('hardhat');
    if (!btcDeposit) btcDeposit = 1000000;

    const deployInfo = await loadDeploymentInfo(
        process.env.NETWORK_NAME ?? hardhat.network.name,
        'DLCManager'
    );
    const accounts = await hardhat.ethers.getSigners();

    const dlcManager = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );

    const tx = await dlcManager.setupVault(btcDeposit);
    const receipt = await tx.wait();
    console.dir(tx, { depth: 4 });
    console.dir(receipt, { depth: 4 });
}

module.exports = dlcManagerSetupVault;

if (require.main === module) {
    const deposit = process.argv[2];
    dlcManagerSetupVault(deposit).catch(console.error);
}
