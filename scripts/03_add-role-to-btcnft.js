require('dotenv').config();
const web3 = require('web3');
const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function addRoleToBtcNft(role, grantRoleToAddress) {
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'BtcNft',
        'v1'
    );
    const accounts = await hardhat.ethers.getSigners();

    const dlcManager = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );
    const RoleInBytes = web3.utils.soliditySha3(role);
    const tx = await dlcManager.grantRole(RoleInBytes, grantRoleToAddress);
    const receipt = await tx.wait();
    console.log(``);
};
