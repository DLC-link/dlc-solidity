require('dotenv').config();
const hardhat = require('hardhat');
const web3 = require('web3');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function deployV1(attestorCount) {
    await hardhat.run('compile');
    const network = hardhat.network.name;
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const protocol = accounts[1];
    const protocolWallet = accounts[2];

    console.log(`Deploying AttestorManager to ${network}...`);
    const AttestorManager = await hardhat.ethers.getContractFactory(
        'AttestorManager'
    );
    const attestorManager = await AttestorManager.deploy();
    await attestorManager.deployed();
    console.log(
        `deployed contract AttestorManager to ${attestorManager.address} (network: ${network})`
    );
    await saveDeploymentInfo(
        deploymentInfo(hardhat, attestorManager, 'AttestorManager'),
        'v1'
    );

    console.log(`deploying contract DLCManager to network "${network}"...`);
    const DLCManager = await hardhat.ethers.getContractFactory('DLCManagerV1');
    const dlcManager = await DLCManager.deploy(
        admin.address,
        attestorManager.address
    );
    await dlcManager.deployed();
    console.log(
        `deployed contract DLCManager to ${dlcManager.address} (network: ${network})`
    );

    await saveDeploymentInfo(
        deploymentInfo(hardhat, dlcManager, 'DlcManager'),
        'v1'
    );

    console.log(`deploying contract MockProcotol to network "${network}"...`);
    const MockProtocol = await hardhat.ethers.getContractFactory(
        'MockProtocol'
    );

    const mockProtocol = await MockProtocol.connect(protocol).deploy(
        dlcManager.address,
        protocolWallet.address
    );
    await mockProtocol.deployed();
    console.log(
        `deployed contract MockProtocol to ${mockProtocol.address} (network: ${network})`
    );
    await saveDeploymentInfo(
        deploymentInfo(hardhat, mockProtocol, 'MockProtocol'),
        'v1'
    );
};
