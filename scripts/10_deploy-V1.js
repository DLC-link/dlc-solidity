require('dotenv').config();
const hardhat = require('hardhat');
const web3 = require('web3');
const prompts = require('prompts');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const chainlinkPricefeedAddresses = require('./helpers/chainlink-pricefeed-addresses');

module.exports = async function deployV1(version) {
    const network = hardhat.network.name;
    const response = await prompts({
        type: 'confirm',
        name: 'continue',
        message: `You are about to deploy ${version} contracts to ${network}. Continue?`,
        initial: false,
    });
    if (!response.continue) {
        return;
    }

    let CLpricefeed = chainlinkPricefeedAddresses[network];
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const usdcDeployer = accounts[1];
    const protocol = accounts[2];

    const contractSelectPrompt = await prompts({
        type: 'multiselect',
        name: 'contracts',
        message: `Select contracts to deploy to ${network}`,
        choices: [
            {
                title: `AttestorManager | deployer: ${admin.address}`,
                value: 'AttestorManager',
            },

            {
                title: `DLCManager | deployer: ${admin.address}`,
                value: 'DLCManager',
            },
            {
                title: `MockProtocol | deployer: ${protocol.address}`,
                value: 'MockProtocol',
            },
            {
                title: `USDC | deployer: ${usdcDeployer.address}`,
                value: 'USDC',
            },
            {
                title: `LendingContract | deployer: ${protocol.address}`,
                value: 'LendingContract',
            },
        ],
        min: 0,
        max: 5,
    });

    console.log('Deploying contracts...', ...contractSelectPrompt.contracts);

    await hardhat.run('compile');

    if (contractSelectPrompt.contracts.includes('AttestorManager')) {
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
            version
        );
    }

    if (contractSelectPrompt.contracts.includes('DLCManager')) {
        const attestorManagerAddress = (
            await loadDeploymentInfo(network, 'AttestorManager', version)
        ).contract.address;

        console.log(`deploying contract DLCManager to network "${network}"...`);
        const DLCManager = await hardhat.ethers.getContractFactory(
            'DLCManagerV1'
        );
        const dlcManager = await DLCManager.deploy(
            admin.address,
            attestorManagerAddress
        );
        await dlcManager.deployed();
        console.log(
            `deployed contract DLCManager to ${dlcManager.address} (network: ${network})`
        );
        await saveDeploymentInfo(
            deploymentInfo(hardhat, dlcManager, 'DlcManager'),
            version
        );
    }

    if (contractSelectPrompt.contracts.includes('MockProtocol')) {
        const dlcManagerAddress = (
            await loadDeploymentInfo(network, 'DlcManager', version)
        ).contract.address;
        console.log(
            `deploying contract MockProcotol to network "${network}"...`
        );
        const MockProtocol = await hardhat.ethers.getContractFactory(
            'MockProtocol'
        );

        const mockProtocol = await MockProtocol.connect(protocol).deploy(
            dlcManagerAddress,
            protocol.address
        );
        await mockProtocol.deployed();
        console.log(
            `deployed contract MockProtocol to ${mockProtocol.address} (network: ${network})`
        );
        await saveDeploymentInfo(
            deploymentInfo(hardhat, mockProtocol, 'MockProtocol'),
            version
        );
    }

    /////////////// Lending Demo ///////////////
    // USDC contract deployment

    if (contractSelectPrompt.contracts.includes('USDC')) {
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
        await saveDeploymentInfo(
            deploymentInfo(hardhat, usdc, 'USDC'),
            version
        );
    }

    if (contractSelectPrompt.contracts.includes('LendingContract')) {
        const dlcManagerAddress = (
            await loadDeploymentInfo(network, 'DlcManager', version)
        ).contract.address;
        const usdcAddress = (await loadDeploymentInfo(network, 'USDC', version))
            .contract.address;

        const usdc = await hardhat.ethers.getContractAt(
            'USDStableCoinForDLCs',
            usdcAddress
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

        console.log(
            `deploying contract LendingContractV1 to network "${network}"...`
        );
        const LendingDemo = await hardhat.ethers.getContractFactory(
            'LendingContractV1'
        );
        const lendingDemo = await LendingDemo.connect(protocol).deploy(
            dlcManagerAddress,
            usdcAddress,
            protocol.address,
            CLpricefeed
        );

        await lendingDemo.deployed();
        console.log(
            `deployed contract LendingContractV1 to ${lendingDemo.address} (network: ${network})`
        );
        await saveDeploymentInfo(
            deploymentInfo(hardhat, lendingDemo, 'LendingContract'),
            version
        );

        console.log('Minting 10M USDC to LendingContract...');
        await usdc
            .connect(usdcDeployer)
            .mint(
                lendingDemo.address,
                hardhat.ethers.utils.parseUnits('10000000', 'ether')
            );
    }
};
