require('dotenv').config();
const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('../helpers/deployment-handlers_versioned');

module.exports = async function lendingCloseLoan(loanID) {
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

    const tx = await lendingDemo.closeLoan(loanID);
    const receipt = await tx.wait();
    console.log(receipt);
};
