const { ethers } = require('hardhat');

async function main() {

    // Setup accounts
    const accounts = await hre.ethers.getSigners();
    const deployer = accounts[0];
    const protocol = accounts[1];
    const user = accounts[2];

    // hardhat always deploys to the same address (it seems so for now)
    const dlcManager = await ethers.getContractAt('DLCManager', '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512');
    const lendingDemo = await ethers.getContractAt('LendingDemo', '0x8464135c8f25da09e49bc8782676a84730c318bc');

    let amount = 130000000; // 1.3 BTC
    const tx = await lendingDemo.connect(user).setupLoan(amount, 0, 0, 0);
    const txF = await tx.wait();

    // TODO: should we wait for the observer to call back into the chain or just fake it and let it run?

    dlcManager.once('PostCreateDLC', async (_uuid, _creator, _emergencyRefundTime, _nonce, _eventSource) => {
        console.log('psotcreatedlc calback running...')
    })

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
