require('dotenv').config();
const hardhat = require('hardhat');
const web3 = require('web3');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const chainlinkPricefeedAddresses = require('./helpers/chainlink-pricefeed-addresses');

module.exports = async function deployV1(attestorCount) {
    await hardhat.run('compile');
    const network = hardhat.network.name;
    let CLpricefeed = chainlinkPricefeedAddresses[network];
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const usdcDeployer = accounts[1];
    const protocol = accounts[2];

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
        protocol.address
    );
    await mockProtocol.deployed();
    console.log(
        `deployed contract MockProtocol to ${mockProtocol.address} (network: ${network})`
    );
    await saveDeploymentInfo(
        deploymentInfo(hardhat, mockProtocol, 'MockProtocol'),
        'v1'
    );

    if (network === 'localhost') {
        console.log(
            `deploying contract MockV3Aggregator to network "${network}"...`
        );
        const MockV3Aggregator = await hardhat.ethers.getContractFactory(
            'MockV3Aggregator'
        );
        const mockV3Aggregator = await MockV3Aggregator.deploy(0, 0);
        await mockV3Aggregator.deployTransaction.wait();
        console.log(
            `deployed contract MockV3Aggregator to ${mockV3Aggregator.address} (network: ${network})`
        );
        CLpricefeed = mockV3Aggregator.address;
    }

    /////////////// Lending Demo ///////////////
    // USDC contract deployment
    console.log(
        `deploying contract for token USDStableCoinForDLCs (USDC) to network "${network}"...`
    );
    const USDC = await hardhat.ethers.getContractFactory(
        'USDStableCoinForDLCs'
    );
    const usdc = await USDC.connect(usdcDeployer).deploy();
    await usdc.deployed();
    console.log(
        `deployed contract for token USDStableCoinForDLCs (USDC) to ${usdc.address} (network: ${network})`
    );
    await saveDeploymentInfo(deploymentInfo(hardhat, usdc, 'USDC'), 'v1');

    console.log(
        `deploying contract LendingContractV1 to network "${network}"...`
    );
    const LendingDemo = await hardhat.ethers.getContractFactory(
        'LendingContractV1'
    );
    const lendingDemo = await LendingDemo.connect(protocol).deploy(
        dlcManager.address,
        usdc.address,
        protocol.address,
        CLpricefeed
    );

    await lendingDemo.deployed();
    console.log(
        `deployed contract LendingContractV1 to ${lendingDemo.address} (network: ${network})`
    );
    await saveDeploymentInfo(
        deploymentInfo(hardhat, lendingDemo, 'LendingContract'),
        'v1'
    );

    await usdc
        .connect(usdcDeployer)
        .mint(
            lendingDemo.address,
            hardhat.ethers.utils.parseUnits('10000000', 'ether')
        );
};
