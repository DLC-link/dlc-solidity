require('dotenv').config();
const web3 = require('web3');
const pricefeeds = require('./helpers/chainlink-pricefeed-addresses');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers');

module.exports = async function deploySpecific(contractName, options) {
    const hardhat = require('hardhat');
    await hardhat.run('compile');

    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const network = hardhat.network.name;
    let CLpricefeed = pricefeeds[network];
    console.log(`Deploying ${contractName} to ${network}...`);
    const observerAddress = process.env.OBSERVER_ADDRESS;

    if (!CLpricefeed) throw 'Missing env vars';

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

    if (contractName === 'DLCManager') {
        // DLC Manager deployment
        console.log(`deploying contract DLCManager to network "${network}"...`);
        const DLCManager = await hardhat.ethers.getContractFactory(
            'DLCManager'
        );
        const dlcManager = await DLCManager.deploy(
            deployer.address,
            CLpricefeed
        );
        await dlcManager.deployed();
        console.log(
            `deployed contract DLCManager to ${dlcManager.address} (network: ${network})`
        );
        saveDeploymentInfo(deploymentInfo(hardhat, dlcManager, 'DlcManager'));

        if (observerAddress) {
            // Setting Observer as DLC_ADMIN_ROLE
            await dlcManager
                .connect(deployer)
                .grantRole(
                    web3.utils.soliditySha3('DLC_ADMIN_ROLE'),
                    observerAddress
                );
        }
    } else if (contractName === 'BtcNft') {
        // BTCNFT deployment
        console.log(
            `deploying contract for nft BtcNft (DLC) to network "${network}"...`
        );
        const BtcNft = await hardhat.ethers.getContractFactory('BtcNft');
        const btcNft = await BtcNft.deploy();
        await btcNft.deployed();
        console.log(
            `deployed contract for nft BtcNft (DLC) to ${btcNft.address} (network: ${network})`
        );
        saveDeploymentInfo(deploymentInfo(hardhat, btcNft, 'BtcNft'));

        if (observerAddress) {
            // Setting MINTER_ROLE and PAUSER_ROLE for Observer
            await btcNft
                .connect(deployer)
                .grantRole(
                    web3.utils.soliditySha3('MINTER_ROLE'),
                    observerAddress
                );
            await btcNft
                .connect(deployer)
                .grantRole(
                    web3.utils.soliditySha3('PAUSER_ROLE'),
                    observerAddress
                );
        }
    } else if (contractName === 'DLCBTC') {
        // DLCBTC deployment
        console.log(`deploying contract DLCBTC to network "${network}"...`);
        const DLCBTC = await hardhat.ethers.getContractFactory('DLCBTC');
        const dlcBtc = await DLCBTC.deploy();
        await dlcBtc.deployed();
        console.log(
            `deployed contract DLCBTC to ${dlcBtc.address} (network: ${network})`
        );
        saveDeploymentInfo(deploymentInfo(hardhat, dlcBtc, 'DLCBTC'));
    } else if (contractName === 'DlcBroker') {
        const dlcManager = await loadDeploymentInfo(network, 'DlcManager');
        const btcNft = await loadDeploymentInfo(network, 'BtcNft');
        const dlcBtc = await loadDeploymentInfo(network, 'DLCBTC');
        // DlcBroker deployment
        console.log(`deploying contract DlcBroker to network "${network}"...`);
        const DlcBroker = await hardhat.ethers.getContractFactory('DlcBroker');
        const dlcBroker = await DlcBroker.deploy(
            dlcManager.contract.address,
            btcNft.contract.address,
            dlcBtc.contract.address
        );
        await dlcBroker.deployed();
        console.log(
            `deployed contract DlcBroker to ${dlcBroker.address} (network: ${network})`
        );
        saveDeploymentInfo(deploymentInfo(hardhat, dlcBroker, 'DlcBroker'));
    } else if (contractName === 'USDC') {
        // USDC contract deployment
        console.log(
            `deploying contract for token USDStableCoinForDLCs (USDC) to network "${network}"...`
        );
        const USDC = await hardhat.ethers.getContractFactory(
            'USDStableCoinForDLCs'
        );
        const usdc = await USDC.deploy();
        await usdc.deployed();
        console.log(
            `deployed contract for token USDStableCoinForDLCs (USDC) to ${usdc.address} (network: ${network})`
        );
        saveDeploymentInfo(deploymentInfo(hardhat, usdc, 'USDC'));
    } else if (contractName === 'LendingContract') {
        const dlcManager = await loadDeploymentInfo(network, 'DlcManager');
        const usdc = await loadDeploymentInfo(network, 'USDC');

        // Sample Protocol Contract deployment
        console.log(
            `deploying contract LendingContract to network "${network}"...`
        );
        const LendingContract = await hardhat.ethers.getContractFactory(
            'LendingContract'
        );
        const lendingContract = await LendingContract.deploy(
            dlcManager.contract.address,
            usdc.contract.address
        );
        await lendingContract.deployed();
        console.log(
            `deployed contract LendingContract to ${lendingContract.address} (network: ${network})`
        );
        saveDeploymentInfo(
            deploymentInfo(hardhat, lendingContract, 'LendingContract')
        );

        // NOTE: only for goerli & sepolia
        const usdc_wallet = new hardhat.ethers.Wallet(
            process.env.USDC_KEY
        ).connect(hardhat.ethers.provider);

        const stablecoinContract = new hardhat.ethers.Contract(
            usdc.contract.address,
            usdc.contract.abi
        );

        await stablecoinContract
            .connect(usdc_wallet)
            .mint(
                lendingContract.address,
                hardhat.ethers.utils.parseUnits('10000000', 'ether')
            );
    } else {
        throw 'Unknown contract name';
    }
};
