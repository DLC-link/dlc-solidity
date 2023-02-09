const { ethers } = require('hardhat');

async function main() {
    // Setup accounts
    const accounts = await hre.ethers.getSigners();
    const deployer = accounts[0];
    const protocol = accounts[1];
    const user = accounts[2];

    // TODO: we should read the addresses from the deploymentFiles
    const dlcManager = await ethers.getContractAt('DLCManager', '0x5FbDB2315678afecb367f032d93F642f64180aa3');
    const protocolContract = await ethers.getContractAt('ProtocolContract', '0x8464135c8f25da09e49bc8782676a84730c318bc');

    // We need to set up an open DLC to mint an NFT
    let amount = 130000000; // 1.3 BTC
    const tx = await protocolContract.connect(user).setupLoan(amount, 0, 0, 0);
    const txF = await tx.wait();

    // We let the observer call our contract
    dlcManager.once('PostCreateDLC', async (_uuid, _creator, _emergencyRefundTime, _nonce, _eventSource) => {
        // Who should really call this function to make sure the NFT goes to the right place with the least amount of trust?
        dlcManager.mintBtcNft(_uuid, amount);
    })

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
