const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function setStatusFunded(uuid) {
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

    const setStatusFundedTx = await dlcManager
        .connect(protocol)
        .setStatusFunded(uuid);

    const fundedReceipt = await setStatusFundedTx.wait();
    console.log(fundedReceipt);
};
