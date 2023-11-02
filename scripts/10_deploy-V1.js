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
            {
                title: `BtcNft | deployer: ${admin.address}`,
                value: 'BtcNft',
            },
            {
                title: `DLCBTCExample | deployer: ${admin.address}`,
                value: 'DLCBTCExample',
            },
            {
                title: `DlcRouter | deployer: ${protocol.address}`,
                value: 'DlcRouter',
            },
            {
                title: `DepositDemo | deployer: ${protocol.address}`,
                value: 'DepositDemo',
            },
            {
                title: `USDCBorrowVault | deployer: ${protocol.address}`,
                value: 'USDCBorrowVault',
            },
        ],
        min: 0,
        max: 12,
    });

    console.log('Deploying contracts...', ...contractSelectPrompt.contracts);

    await hardhat.run('compile');

    if (contractSelectPrompt.contracts.includes('AttestorManager')) {
        console.log(`Deploying AttestorManager to ${network}...`);
        const AttestorManager =
            await hardhat.ethers.getContractFactory('AttestorManager');
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
        if (!contractSelectPrompt.contracts.includes('AttestorManager'))
            console.warn('Using earlier AttestorManager deployment...');

        const attestorManagerAddress = (
            await loadDeploymentInfo(network, 'AttestorManager', version)
        ).contract.address;

        console.log(`deploying contract DLCManager to network "${network}"...`);
        const DLCManager =
            await hardhat.ethers.getContractFactory('DLCManagerV1');
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
        const MockProtocol =
            await hardhat.ethers.getContractFactory('MockProtocol');

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
        const dlcManagerDeployInfo = await loadDeploymentInfo(
            network,
            'DlcManager',
            version
        );
        const dlcManagerAddress = dlcManagerDeployInfo.contract.address;
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
            const MockV3Aggregator =
                await hardhat.ethers.getContractFactory('MockV3Aggregator');
            const mockV3Aggregator = await MockV3Aggregator.deploy(
                8,
                2612647400000
            );
            await mockV3Aggregator.deployTransaction.wait();
            console.log(
                `deployed contract MockV3Aggregator to ${mockV3Aggregator.address} (network: ${network})`
            );
            CLpricefeed = mockV3Aggregator.address;
        }

        console.log(
            `deploying contract LendingContractV1 to network "${network}"...`
        );
        const LendingDemo =
            await hardhat.ethers.getContractFactory('LendingContractV1');
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

        console.log('Done');

        console.log(
            'Adding WHITELISTED_CONTRACT and WHITELISTED_WALLET to DlcManager...'
        );
        const dlcManager = new hardhat.ethers.Contract(
            dlcManagerDeployInfo.contract.address,
            dlcManagerDeployInfo.contract.abi,
            admin
        );

        await dlcManager.grantRole(
            web3.utils.soliditySha3('WHITELISTED_CONTRACT'),
            lendingDemo.address
        );
        await dlcManager.grantRole(
            web3.utils.soliditySha3('WHITELISTED_WALLET'),
            protocol.address
        );

        console.log('Done');
    }

    /////////////// BTC NFT Demo ///////////////

    if (contractSelectPrompt.contracts.includes('BtcNft')) {
        console.log(`deploying contract BtcNft to network "${network}"...`);
        const BtcNft = await hardhat.ethers.getContractFactory('BtcNft');
        const btcNft = await BtcNft.deploy();
        await btcNft.deployed();
        console.log(
            `deployed contract BtcNft to ${btcNft.address} (network: ${network})`
        );
        await saveDeploymentInfo(
            deploymentInfo(hardhat, btcNft, 'BtcNft'),
            version
        );
    }

    if (contractSelectPrompt.contracts.includes('DLCBTCExample')) {
        console.log(
            `deploying contract DLCBTCExample to network "${network}"...`
        );
        const DLCBTCExample =
            await hardhat.ethers.getContractFactory('DLCBTCExample');
        const DLCBTCExample = await DLCBTCExample.deploy();
        await DLCBTCExample.deployed();
        console.log(
            `deployed contract DLCBTCExample to ${DLCBTCExample.address} (network: ${network})`
        );
        await saveDeploymentInfo(
            deploymentInfo(hardhat, DLCBTCExample, 'DLCBTCExample'),
            version
        );
    }

    if (contractSelectPrompt.contracts.includes('DlcRouter')) {
        const dlcManagerDeployInfo = await loadDeploymentInfo(
            network,
            'DlcManager',
            version
        );
        const btcNftAddress = (
            await loadDeploymentInfo(network, 'BtcNft', version)
        ).contract.address;
        const dlcBtcAddress = (
            await loadDeploymentInfo(network, 'DLCBTCExample', version)
        ).contract.address;
        const protocolAddress = protocol.address;

        console.log(`deploying contract DlcRouter to network "${network}"...`);
        console.log(`Constructor params:`);
        console.log(
            `dlcManagerAddress: ${dlcManagerDeployInfo.contract.address}`
        );
        console.log(`btcNftAddress: ${btcNftAddress}`);
        console.log(`dlcBtcAddress: ${dlcBtcAddress}`);
        console.log(`protocolAddress: ${protocolAddress}`);
        const DlcRouter = await hardhat.ethers.getContractFactory('DlcRouter');
        const dlcRouter = await DlcRouter.connect(protocol).deploy(
            dlcManagerDeployInfo.contract.address,
            btcNftAddress,
            dlcBtcAddress,
            protocolAddress
        );
        await dlcRouter.deployed();
        console.log(
            `deployed contract DlcRouter to ${dlcRouter.address} (network: ${network})`
        );
        await saveDeploymentInfo(
            deploymentInfo(hardhat, dlcRouter, 'DlcRouter'),
            version
        );

        const btcnft = await hardhat.ethers.getContractAt(
            'BtcNft',
            btcNftAddress
        );

        console.log('Adding MINTER_ROLE to DlcRouter on BtcNft...');
        await btcnft
            .connect(admin)
            .grantRole(
                hardhat.ethers.utils.id('MINTER_ROLE'),
                dlcRouter.address
            );

        console.log(
            'Adding WHITELISTED_CONTRACT and WHITELISTED_WALLET to DlcManager...'
        );
        const dlcManager = new hardhat.ethers.Contract(
            dlcManagerDeployInfo.contract.address,
            dlcManagerDeployInfo.contract.abi,
            admin
        );

        await dlcManager.grantRole(
            web3.utils.soliditySha3('WHITELISTED_CONTRACT'),
            dlcRouter.address
        );
        await dlcManager.grantRole(
            web3.utils.soliditySha3('WHITELISTED_WALLET'),
            protocolAddress
        );
    }

    /////////////// Deposit Demo ///////////////

    if (contractSelectPrompt.contracts.includes('DepositDemo')) {
        let dlcManagerDeployInfo, dlcBtcAddress, protocolAddress;
        try {
            dlcManagerDeployInfo = await loadDeploymentInfo(
                network,
                'DlcManager',
                version
            );
            dlcBtcAddress = (
                await loadDeploymentInfo(network, 'DLCBTCExample', version)
            ).contract.address;
        } catch (error) {
            console.error(
                'Error: Missing dependencies. Please deploy DLCManager and DLCBTCExample first.'
            );
            console.error(error);
            return;
        }
        protocolAddress = protocol.address;

        console.log(
            `deploying contract DepositDemo to network "${network}"...`
        );
        console.log(`Constructor params:`);
        console.log(
            `dlcManagerAddress: ${dlcManagerDeployInfo.contract.address}`
        );
        console.log(`dlcBtcAddress: ${dlcBtcAddress}`);
        console.log(`protocolAddress: ${protocolAddress}`);
        const DepositDemo =
            await hardhat.ethers.getContractFactory('DepositDemo');
        const depositDemo = await DepositDemo.connect(protocol).deploy(
            dlcManagerDeployInfo.contract.address,
            dlcBtcAddress,
            protocolAddress
        );
        await depositDemo.deployed();
        console.log(
            `deployed contract DepositDemo to ${depositDemo.address} (network: ${network})`
        );
        await saveDeploymentInfo(
            deploymentInfo(hardhat, depositDemo, 'DepositDemo'),
            version
        );

        console.log(
            'Adding WHITELISTED_CONTRACT and WHITELISTED_WALLET to DlcManager...'
        );
        const dlcManager = new hardhat.ethers.Contract(
            dlcManagerDeployInfo.contract.address,
            dlcManagerDeployInfo.contract.abi,
            admin
        );

        await dlcManager.grantRole(
            web3.utils.soliditySha3('WHITELISTED_CONTRACT'),
            depositDemo.address
        );
        await dlcManager.grantRole(
            web3.utils.soliditySha3('WHITELISTED_WALLET'),
            protocolAddress
        );
    }

    if (contractSelectPrompt.contracts.includes('USDCBorrowVault')) {
        const dlcBtcAddress = (
            await loadDeploymentInfo(network, 'DLCBTCExample', version)
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
            const MockV3Aggregator =
                await hardhat.ethers.getContractFactory('MockV3Aggregator');
            const mockV3Aggregator = await MockV3Aggregator.deploy(
                8,
                2612647400000
            );
            await mockV3Aggregator.deployTransaction.wait();
            console.log(
                `deployed contract MockV3Aggregator to ${mockV3Aggregator.address} (network: ${network})`
            );
            CLpricefeed = mockV3Aggregator.address;
        }

        console.log(
            `deploying contract USDCBorrowVault to network "${network}"...`
        );
        const USDCBorrowVault =
            await hardhat.ethers.getContractFactory('USDCBorrowVault');
        const usdcBorrowVault = await USDCBorrowVault.connect(protocol).deploy(
            dlcBtcAddress,
            'vaultDLCBTC',
            'vDLCBTC',
            usdcAddress,
            CLpricefeed
        );

        await usdcBorrowVault.deployed();
        console.log(
            `deployed contract USDCBorrowVault to ${usdcBorrowVault.address} (network: ${network})`
        );
        await saveDeploymentInfo(
            deploymentInfo(hardhat, usdcBorrowVault, 'USDCBorrowVault'),
            version
        );

        console.log('Minting 10M USDC to USDCBorrowVault...');
        await usdc
            .connect(usdcDeployer)
            .mint(
                usdcBorrowVault.address,
                hardhat.ethers.utils.parseUnits('10000000', 'ether')
            );

        console.log('Done');
    }
};
