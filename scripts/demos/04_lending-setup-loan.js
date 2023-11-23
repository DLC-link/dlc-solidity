require('dotenv').config();
const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('../helpers/deployment-handlers_versioned');

module.exports = async function lendingSetupLoan(
    btcDeposit = 100000000
    // liquidationRatio = 14000,
    // liquidationFee = 1000,
    // emergencyRefundTime = 5
) {
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'LendingContract',
        'v1'
    );
    const accounts = await hardhat.ethers.getSigners();

    const lendingDemo = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );

    const tx = await lendingDemo.setupLoan(btcDeposit);
    const receipt = await tx.wait();
    console.dir(tx, { depth: 4 });
    console.dir(receipt, { depth: 4 });
};
