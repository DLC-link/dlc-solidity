require('dotenv').config();
const web3 = require('web3');
const hardhat = require('hardhat');
const { loadDeploymentInfo } = require('./helpers/deployment-handlers');

module.exports = async function addRoleToManager(role, grantRoleToAddress) {
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcManager'
    );
    const accounts = await hardhat.ethers.getSigners();

    const dlcManager = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );
    const RoleInBytes = web3.utils.soliditySha3(role);
    const tx = await dlcManager.grantRole(RoleInBytes, grantRoleToAddress);
    console.log(tx);
};
