const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('../helpers/deployment-handlers_versioned');

module.exports = async function setupVault(
    btcDeposit,
    attestorCount,
    setFunded
) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const protocol = accounts[2];

    const dlcManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcManager',
        'v1'
    );

    const dlcManager = new hardhat.ethers.Contract(
        dlcManagerDeployInfo.contract.address,
        dlcManagerDeployInfo.contract.abi,
        admin
    );

    const dlcRouterDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcRouter',
        'v1'
    );

    const dlcRouter = new hardhat.ethers.Contract(
        dlcRouterDeployInfo.contract.address,
        dlcRouterDeployInfo.contract.abi,
        protocol
    );

    const requestTx = await dlcRouter.setupVault(btcDeposit, attestorCount);

    const receipt = await requestTx.wait();
    const event = receipt.events[0];
    const decodedEvent = dlcManager.interface.parseLog(event);
    const uuid = decodedEvent.args.uuid;
    console.log('SetupVault called, uuid:', uuid);
    console.log(decodedEvent.args);

    if (setFunded) {
        console.log('Simulating setStatusFunded...');
        const setStatusFundedTx = await dlcManager
            .connect(protocol)
            .setStatusFunded(uuid);
        const fundedReceipt = await setStatusFundedTx.wait();
        console.log(fundedReceipt);
        const fundedEvent = fundedReceipt.events[0];
        const fundedDecodedEvent = dlcManager.interface.parseLog(fundedEvent);
        console.log(fundedDecodedEvent.args);
    }
};
