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

module.exports = { revokeRoleOnManager, removeSigner };

if (require.main === module) {
    const role = process.argv[2];
    const address = process.argv[3];
    revokeRoleOnManager(role, address).catch(console.error);
}
