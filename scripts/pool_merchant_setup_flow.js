require('dotenv').config();
const hre = require('hardhat');
const { ethers, upgrades } = require('hardhat');
const { loadContractAddress, promptUser } = require('./helpers/utils');
const {
    saveDeploymentInfo,
    deploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

async function main() {
    const network = hre.network.name;
    const shouldContinue = await promptUser(
        `You are about to interact with ${network}.\n Continue?`
    );
    if (!shouldContinue) {
        throw new Error('Deployment aborted by user.');
    }
    // Compile contracts
    console.log('\n🔨 Compiling contracts...');
    await hre.run('compile');

    console.log('\n🚀 Starting setup...');

    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const dlcAdmin = deployer;
    const attestor_1 = '0x3355977947F84C2b1CAE7D2903a72958aEE185e2'; // TODO: devnet attestor 1
    const operator = deployer;
    const harvester = deployer;

    // DLCManager upgrade remains the same
    console.log('\n🔄 Upgrading DLCManager...');
    const proxyAddress = await loadContractAddress('DLCManager', network);
    // const newImplementation = await ethers.getContractFactory('DLCManager');
    // await upgrades.upgradeProxy(proxyAddress, newImplementation);

    // await hre.run('verify:verify', {
    //     address: proxyAddress,
    // });
    // console.log('DLCManager upgraded');

    console.log('\n📝 Getting contract instances...');
    const dlcManager = await ethers.getContractAt('DLCManager', proxyAddress);

    // try {
    //     await saveDeploymentInfo(
    //         deploymentInfo(network, dlcManager, 'DLCManager')
    //     );
    // } catch (error) {
    //     console.error(error);
    // }

    const dlcBTCAddress = await loadContractAddress('DLCBTC', network);
    const dlcBTC = await ethers.getContractAt('DLCBTC', dlcBTCAddress);

    // Deploy PoolMerchant
    console.log('\n🏗️ Deploying PoolMerchant...');
    const poolMerchantAddress = await loadContractAddress(
        'PoolMerchant',
        network
    );
    const poolMerchant = await ethers.getContractAt(
        'PoolMerchant',
        poolMerchantAddress
    );
    // const PoolMerchant = await ethers.getContractFactory('PoolMerchant');
    // const poolMerchant = await upgrades.deployProxy(PoolMerchant, [
    //     proxyAddress,
    //     dlcBTCAddress,
    //     deployer.address,
    // ]);
    // await poolMerchant.deployed();
    // console.log('PoolMerchant deployed to:', poolMerchant.address);
    // try {
    //     await saveDeploymentInfo(
    //         deploymentInfo(network, poolMerchant, 'PoolMerchant')
    //     );
    // } catch (error) {
    //     console.error(error);
    // }
    // await hre.run('verify:verify', {
    //     address: poolMerchant.address,
    // });

    // // Whitelist PoolMerchant
    // await dlcManager.connect(dlcAdmin).whitelistAddress(poolMerchant.address);

    console.log('\n🏗️  Deploying MockERC4626Vault...');
    const MockERC4626Vault =
        await ethers.getContractFactory('MockERC4626Vault');

    const mockVault = await ethers.getContractAt(
        'MockERC4626Vault',
        '0x7B4c1663945767426177277Fa04777912720D39A'
    );
    // const mockVault = await MockERC4626Vault.deploy(dlcBTCAddress);
    // await mockVault.deployed();
    // console.log('MockERC4626Vault deployed to:', mockVault.address);
    // await hre.run('verify:verify', {
    //     address: mockVault.address,
    // });

    console.log('\n🏗️  Deploying IntegrationSample...');
    const IntegrationSample =
        await ethers.getContractFactory('IntegrationSample');

    const rewardRatePerSecond = ethers.BigNumber.from('317');

    const integrationSample = await IntegrationSample.deploy(
        mockVault.address,
        dlcBTCAddress,
        rewardRatePerSecond,
        poolMerchant.address,
        dlcBTC.address
    );
    await integrationSample.deployed();
    console.log('IntegrationSample deployed to:', integrationSample.address);

    try {
        await hre.run('verify:verify', {
            address: integrationSample.address,
        });
    } catch (error) {
        console.error(error);
    }

    // Setup roles and integration
    console.log('\n🔑 Setting up roles and integration...');
    await poolMerchant.grantRole(
        await poolMerchant.ATTESTOR_ROLE(),
        attestor_1
    );
    await poolMerchant.grantRole(
        await poolMerchant.HARVESTER_ROLE(),
        harvester.address
    );

    console.log('\n🪙 Adding dlcBTC as reward token...');
    await poolMerchant.addRewardToken(dlcBTCAddress);

    console.log('\n🔄 Setting up Integration...');
    await poolMerchant.setIntegration(integrationSample.address, [
        dlcBTCAddress,
    ]);

    console.log('\n✅ Setup sequence complete');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
