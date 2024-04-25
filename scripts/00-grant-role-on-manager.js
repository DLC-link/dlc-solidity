const hardhat = require('hardhat');
const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function registerProtocol(protocolContractAddress) {
    await grantRoleOnManager('WHITELISTED_CONTRACT', protocolContractAddress);
}

async function addSigner(signer) {
    await grantRoleOnManager('APPROVED_SIGNER', signer);
}

async function grantRoleOnManager(role, grantRoleToAddress) {
    const roleInBytes = hardhat.ethers.utils.id(role);
    await callManagerContractFunction('grantRole', [
        roleInBytes,
        grantRoleToAddress,
    ]);
}

module.exports = { grantRoleOnManager, registerProtocol, addSigner };
