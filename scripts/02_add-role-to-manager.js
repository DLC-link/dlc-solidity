require('dotenv').config();

const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function addRoleToManager(role, grantRoleToAddress) {
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcManager',
        'v1'
    );
    const accounts = await hardhat.ethers.getSigners();

    const dlcManager = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );
    const RoleInBytes = hardhat.ethers.utils.id(role);
    const tx = await dlcManager.grantRole(RoleInBytes, grantRoleToAddress);
    const txRequest = await dlcManager.populateTransaction.grantRole(
        RoleInBytes,
        grantRoleToAddress
    );
    console.log(tx);
};
