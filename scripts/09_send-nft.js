require('dotenv').config();
const hardhat = require('hardhat');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers');

module.exports = async function sendNFT(privateKey, addressTo, id) {
    if (!privateKey || !addressTo || !id) throw 'Missing params';

    const wallet = new hardhat.ethers.Wallet(privateKey).connect(
        hardhat.ethers.provider
    );

    const network = hardhat.network.name;
    const btcNft = await loadDeploymentInfo(network, 'BtcNft');
    const btcNftContract = await hardhat.ethers.getContractAt(
        btcNft.contract.name,
        btcNft.contract.address
    );

    const tx = await btcNftContract
        .connect(wallet)
        ['safeTransferFrom(address,address,uint256)'](
            wallet.address,
            addressTo,
            id
        );

    const txreceipt = await tx.wait();
    console.log(txreceipt);
};
