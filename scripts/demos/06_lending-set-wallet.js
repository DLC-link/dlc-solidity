require('dotenv').config();
const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('../helpers/deployment-handlers_versioned');

module.exports = async function lendingSetWallet(address, version) {
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'LendingDemo',
        version
    );
    const accounts = await hardhat.ethers.getSigners();

    const lendingDemo = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );

    const tx = await lendingDemo.setProtocolWallet(address);
    const receipt = await tx.wait();
    console.log(receipt);
};
