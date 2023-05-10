require('dotenv').config();
const hardhat = require('hardhat');
const { loadDeploymentInfo } = require('./helpers/deployment-handlers');

module.exports = async function mintStablecoin(addressTo, amount, privateKey) {
    const deployInfo = await loadDeploymentInfo(hardhat.network.name, 'USDC');
    let wallet;

    if (privateKey) {
        wallet = new hardhat.ethers.Wallet(privateKey).connect(
            hardhat.ethers.provider
        );
    } else {
        wallet = await hardhat.ethers.getSigners()[0];
    }

    const stablecoinContract = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi
    );

    const tx = await stablecoinContract
        .connect(wallet)
        .mint(
            addressTo,
            hardhat.ethers.utils.parseUnits(amount.toString(), 'ether')
        );
    await tx.wait();
    console.log(tx);
};
