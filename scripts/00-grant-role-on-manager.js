const hardhat = require('hardhat');
const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function registerProtocol(protocolContractAddress, version) {
    await grantRoleOnManager(
        'WHITELISTED_CONTRACT',
        protocolContractAddress,
        version
    );
}

async function addSigner(signer, version) {
    await grantRoleOnManager('APPROVED_SIGNER', signer, version);
}

async function grantRoleOnManager(role, grantRoleToAddress, version) {
    const roleInBytes = hardhat.ethers.utils.id(role);
    await callManagerContractFunction(
        'grantRole',
        [roleInBytes, grantRoleToAddress],
        version
    );
}

module.exports = { grantRoleOnManager, registerProtocol, addSigner };
