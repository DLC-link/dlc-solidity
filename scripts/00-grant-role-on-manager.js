require('dotenv').config();

const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

module.exports = async function grantRoleOnManager(
    role,
    grantRoleToAddress,
    version
) {
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcManager',
        version
    );
    const accounts = await hardhat.ethers.getSigners();

    if (hardhat.network.name === 'localhost') {
        const dlcManager = new hardhat.ethers.Contract(
            deployInfo.contract.address,
            deployInfo.contract.abi,
            accounts[0]
        );
        const roleInBytes = hardhat.ethers.utils.id(role);
        const tx = await dlcManager.grantRole(roleInBytes, grantRoleToAddress);
        await tx.wait();
        console.log(tx);
        return;
    } else {
        // NOTE: TODO: accounts[3] should be the SAFE_FOR_KEY account
        const dlcManager = new hardhat.ethers.Contract(
            deployInfo.contract.address,
            deployInfo.contract.abi,
            accounts[0]
        );

        const roleInBytes = hardhat.ethers.utils.id(role);
        const txRequest = await dlcManager.populateTransaction.grantRole(
            roleInBytes,
            grantRoleToAddress
        );
        await safeContractProposal(txRequest, accounts[0]);
        return;
    }
};
