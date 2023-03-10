require('dotenv').config();
const hardhat = require('hardhat');
const { loadDeploymentInfo } = require('./helpers/deployment-handlers');

module.exports = async function nftSetupVault(
    btcDeposit = 100000000,
    emergencyRefundTime = 5
) {
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcBroker'
    );
    const accounts = await hardhat.ethers.getSigners();

    const broker = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );

    const tx = await broker.setupVault(btcDeposit, emergencyRefundTime);
    const receipt = await tx.wait();
    console.log(receipt);
};
