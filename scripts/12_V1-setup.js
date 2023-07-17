const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

const addAttestor = require('./12_a_V1-add-attestor');
const registerProtocol = require('./12_b_V1-register-protocol');

// const attestorList = ['http://localhost:8801', 'http://localhost:8802', 'http://localhost:8803'];
const attestorList = ['http://localhost:8801'];

module.exports = async function setupV1() {
    const accounts = await hardhat.ethers.getSigners();
    const protocol = accounts[1];
    const protocolWallet = accounts[2];

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

    for (const attestor of attestorList) {
        await addAttestor(attestor);
    }

    console.log('Adding protocol as whitelisted contract and wallet...');
    await registerProtocol(mockProtocol.address, protocolWallet.address);
};
