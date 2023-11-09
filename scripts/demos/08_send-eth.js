require('dotenv').config();
const hardhat = require('hardhat');

module.exports = async function sendEth(addressTo, amount) {
    if (!addressTo || !amount) throw 'Missing params';
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const tx = await deployer.sendTransaction({
        to: addressTo,
        value: hardhat.ethers.utils.parseEther(amount.toString()),
    });
    const receipt = await tx.wait();
    console.log(receipt);
};
