require('dotenv').config();
const hardhat = require('hardhat');
const { loadDeploymentInfo } = require('./helpers/deployment-handlers');

module.exports = async function mintStablecoin(addressTo, amount) {
    const deployInfo = await loadDeploymentInfo(hardhat.network.name, 'USDC');
    const accounts = await hardhat.ethers.getSigners();
    const stablecoinContract = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );

    const tx = await stablecoinContract.mint(
        addressTo,
        hardhat.ethers.utils.parseUnits(amount.toString(), 'ether')
    );
    await tx.wait();
    console.log(tx);
};
