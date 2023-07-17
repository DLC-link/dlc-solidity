const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function closeDLC(uuid, outcome) {
    const accounts = await hardhat.ethers.getSigners();
    const protocol = accounts[1];

    const mockProtocolDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'MockProtocol',
        'v1'
    );

    const mockProtocol = new hardhat.ethers.Contract(
        mockProtocolDeployInfo.contract.address,
        mockProtocolDeployInfo.contract.abi,
        protocol
    );

    console.log('Calling closeDLC with uuid', uuid, 'and outcome', outcome);
    const closeDLCtx = await mockProtocol.requestCloseDLC(uuid, outcome);
    await closeDLCtx.wait();
};
