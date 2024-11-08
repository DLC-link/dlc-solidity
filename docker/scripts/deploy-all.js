require('dotenv').config();
const hardhat = require('hardhat');
const getContractConfigs = require('../../scripts/99_contract-configs');
const dlcAdminSafesConfigs = require('../../scripts/helpers/dlc-admin-safes');
const addSigner = require('../../scripts/00-grant-role-on-manager').addSigner;
const setWhitelisting = require('../../scripts/13_set-whitelisting');
const { loadContractAddress } = require('../../scripts/helpers/utils');

process.env.CLI_MODE = 'noninteractive';

async function main() {
    const network = process.env.NETWORK_NAME ?? 'localhost';
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const dlcAdminSafes = {
        medium: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        critical: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    }; // Hardhat default deployer account
    const defaultSigners = [
        '0x976EA74026E726554dB657fA54763abd0C3a0aa9', // account[6]
        '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955', // account[7]
        '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f', // account[8]
    ];

    const contractConfigs = getContractConfigs(
        {
            deployer,
            dlcAdminSafes,
            networkName: network,
        },
        process.env.BTC_FEE_RECIPIENT
    );

    await hardhat.run('compile');

    for (const contractConfig of contractConfigs) {
        const requirements = contractConfig.requirements;
        const reqs = {};
        for (const requirement of requirements) {
            reqs[requirement] = await loadContractAddress(requirement, network);
        }
        await contractConfig.deploy(reqs);
    }

    console.log('\n📝 Getting contract instances...');
    const proxyAddress = await loadContractAddress('DLCManager', network);
    const dlcManager = await hardhat.ethers.getContractAt(
        'DLCManager',
        proxyAddress
    );
    const dlcBTCAddress = await loadContractAddress('DLCBTC', network);
    const dlcBTC = await hardhat.ethers.getContractAt('DLCBTC', dlcBTCAddress);
    const poolMerchantAddress = await loadContractAddress(
        'PoolMerchant',
        network
    );
    const poolMerchant = await hardhat.ethers.getContractAt(
        'PoolMerchant',
        poolMerchantAddress
    );

    console.log('\n🏗️  Deploying MockERC4626Vault...');
    const MockERC4626Vault =
        await hardhat.ethers.getContractFactory('MockERC4626Vault');
    const mockVault = await MockERC4626Vault.deploy(dlcBTCAddress);
    await mockVault.deployed();
    console.log('MockERC4626Vault deployed to:', mockVault.address);

    console.log('\n🏗️  Deploying IntegrationSample...');
    const IntegrationSample =
        await hardhat.ethers.getContractFactory('IntegrationSample');
    const rewardRatePerSecond = hardhat.ethers.BigNumber.from('317');
    const integrationSample = await IntegrationSample.deploy(
        mockVault.address,
        dlcBTCAddress,
        rewardRatePerSecond,
        poolMerchant.address,
        dlcBTCAddress
    );
    await integrationSample.deployed();
    console.log('IntegrationSample deployed to:', integrationSample.address);

    console.log('Deployment complete');

    console.log('\n🔑 Setting up roles and integration...');
    await poolMerchant.grantRole(
        await poolMerchant.ATTESTOR_ROLE(),
        defaultSigners[0]
    );
    await poolMerchant.grantRole(
        await poolMerchant.HARVESTER_ROLE(),
        deployer.address
    );

    console.log('\n🪙 Adding dlcBTC as reward token...');
    await poolMerchant.addRewardToken(dlcBTCAddress);

    console.log('\n🔄 Setting up Integration...');
    await poolMerchant.setIntegration(integrationSample.address, [
        dlcBTCAddress,
    ]);

    // Adding signers

    for (const signer of defaultSigners) {
        await addSigner(signer);
    }

    // Set whitelisting
    await setWhitelisting('false');

    console.log('\n✅ Setup sequence complete');
}

// make sure we catch all errors
main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
