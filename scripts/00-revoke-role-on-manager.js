const hardhat = require('hardhat');
const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function removeSigner(signer, version) {
    await revokeRoleOnManager('APPROVED_SIGNER', signer, version);
}

async function revokeRoleOnManager(role, revokeRoleFromAddress, version) {
    const roleInBytes = hardhat.ethers.utils.id(role);
    await callManagerContractFunction(
        'revokeRole',
        [roleInBytes, revokeRoleFromAddress],
        version
    );
}

module.exports = { revokeRoleOnManager, removeSigner };
