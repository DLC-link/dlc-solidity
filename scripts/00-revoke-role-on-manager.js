const hardhat = require('hardhat');
const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function removeSigner(signer) {
    await revokeRoleOnManager('APPROVED_SIGNER', signer);
}

async function revokeRoleOnManager(role, revokeRoleFromAddress) {
    const roleInBytes = hardhat.ethers.utils.id(role);
    await callManagerContractFunction('revokeRole', [
        roleInBytes,
        revokeRoleFromAddress,
    ]);
}

async function renounceRoleOnManager(role) {
    const roleInBytes = hardhat.ethers.utils.id(role);
    const address = (await hardhat.ethers.getSigners())[0].address;
    await callManagerContractFunction('renounceRole', [roleInBytes, address]);
}

module.exports = { revokeRoleOnManager, removeSigner, renounceRoleOnManager };

if (require.main === module) {
    const role = process.argv[2];
    const address = process.argv[3];
    revokeRoleOnManager(role, address).catch(console.error);
}
