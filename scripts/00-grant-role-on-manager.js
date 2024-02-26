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
    const roleInBytes = hardhat.ethers.utils.id(role);
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DLCManager',
        version
    );
    const dlcManager = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi
    );

    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];

    console.log('granting role', role, 'to', grantRoleToAddress, '...');

    if (
        hardhat.network.name === 'localhost' ||
        admin.address == (await dlcManager.defaultAdmin())
    ) {
        console.log('admin has DEFAULT_ADMIN_ROLE, granting role...');
        const tx = await dlcManager
            .connect(admin)
            .grantRole(roleInBytes, grantRoleToAddress);
        await tx.wait();
        console.log(tx);
        return;
    } else {
        console.log(
            'admin does not have DEFAULT_ADMIN_ROLE, submitting multisig request...'
        );
        const txRequest = await dlcManager
            .connect(admin)
            .populateTransaction.grantRole(roleInBytes, grantRoleToAddress);
        await safeContractProposal(txRequest, admin);
        return;
    }
};
