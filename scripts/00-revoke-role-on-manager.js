require('dotenv').config();

const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

async function removeSigner(signer, version) {
    await revokeRoleOnManager('APPROVED_SIGNER', signer, version);
}

async function revokeRoleOnManager(role, revokeRoleFromAddress, version) {
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

    console.log('revokeing role', role, 'from', revokeRoleFromAddress, '...');

    if (
        hardhat.network.name === 'localhost' ||
        admin.address == (await dlcManager.defaultAdmin())
    ) {
        console.log('admin has DEFAULT_ADMIN_ROLE, revokeing role...');
        const tx = await dlcManager
            .connect(admin)
            .revokeRole(roleInBytes, revokeRoleFromAddress);
        await tx.wait();
        console.log(tx);
        return;
    } else {
        console.log(
            'admin does not have DEFAULT_ADMIN_ROLE, submitting multisig request...'
        );
        const txRequest = await dlcManager
            .connect(admin)
            .populateTransaction.revokeRole(roleInBytes, revokeRoleFromAddress);
        await safeContractProposal(txRequest, admin);
        return;
    }
}

module.exports = { revokeRoleOnManager, removeSigner };
