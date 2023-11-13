const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

// For testing purposes only
module.exports = async function createDLC(attestorCount, version) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const protocol = accounts[1];

    const dlcManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcManager',
        version
    );

    const dlcManager = new hardhat.ethers.Contract(
        dlcManagerDeployInfo.contract.address,
        dlcManagerDeployInfo.contract.abi,
        admin
    );

    const mockProtocolDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'MockProtocol',
        version
    );

    const mockProtocol = new hardhat.ethers.Contract(
        mockProtocolDeployInfo.contract.address,
        mockProtocolDeployInfo.contract.abi,
        protocol
    );

    const requestTx = await mockProtocol.requestCreateDLC(attestorCount);

    const receipt = await requestTx.wait();
    const event = receipt.events[0];
    const decodedEvent = dlcManager.interface.parseLog(event);
    const uuid = decodedEvent.args.uuid;
    console.log('CreateDLCRequested with uuid', uuid);
    console.log(decodedEvent.args);
};
