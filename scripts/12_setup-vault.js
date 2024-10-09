const { task, types } = require('hardhat/config');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

async function dlcManagerSetupVault(hardhat) {
    if (!hardhat || !hardhat.network) hardhat = require('hardhat');

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

    const tx = await dlcManager.setupVault();
    const receipt = await tx.wait();
    console.dir(tx, { depth: 4 });
    console.dir(receipt, { depth: 4 });
}

module.exports = dlcManagerSetupVault;

if (require.main === module) {
    const deposit = process.argv[2];
    dlcManagerSetupVault().catch(console.error);
}
