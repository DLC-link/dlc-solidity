const hre = require('hardhat');
const { ethers, upgrades } = require('hardhat');
const { getSignatures, whitelistAddress } = require('../test/utils');

async function fundAccount(address) {
    await hre.network.provider.send('hardhat_setBalance', [
        address,
        '0x2000000000000000000',
    ]);
}

async function main() {
    console.log('\n🔨 Compiling contracts...');
    await hre.run('compile');

    console.log('\n🚀 Starting happy path integration test...');

    const MAINNET_ADDRESSES = {
        DLC_MANAGER: '0x20157DBAbb84e3BBFE68C349d0d44E48AE7B5AD2',
        DLC_BTC: '0x050C24dBf1eEc17babE5fc585F06116A259CC77A',
    };

    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const dlcAdmin = await ethers.getImpersonatedSigner(
        '0xaA2949C5285C2f2887ABD567865344240c29d619'
    );
    const dlcCritical = await ethers.getImpersonatedSigner(
        '0x24f75096ad315Ab617a3d0f2621aC3e9D391Aa77'
    );
    const attestor_1 = await ethers.getImpersonatedSigner(
        '0x989E9c4005ABc2a8E4b85544B44d2d95cfDe08de'
    );
    const attestor_2 = await ethers.getImpersonatedSigner(
        '0xBe4aAE47A62f67bdF93eA9f5F189ae51B1b54492'
    );
    const attestor_3 = await ethers.getImpersonatedSigner(
        '0x7B254D8C6eBd9662A52180B06920aEA4f23a8940'
    );
    const attestor_4 = await ethers.getImpersonatedSigner(
        '0x194c697e8343EaB3C53917BA7e597d02687f8BA0'
    );
    const attestor_5 = await ethers.getImpersonatedSigner(
        '0x2daef70747eb9E97E5f31A9EBDbda593918F8bE7'
    );
    const operator = deployer;
    const harvester = deployer;

    const attestors = [
        attestor_1,
        attestor_2,
        attestor_3,
        attestor_4,
        attestor_5,
    ];

    console.log('\n💰 Funding impersonated accounts...');
    for (const account of [dlcAdmin, ...attestors]) {
        await fundAccount(account.address);
    }

    console.log('\n🔄 Upgrading DLCManager...');
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(
        MAINNET_ADDRESSES.DLC_MANAGER
    );
    console.log('Proxy admin address:', proxyAdminAddress);
    const connectedProxyAdmin = new ethers.Contract(
        proxyAdminAddress,
        [
            'function owner() view returns (address)',
            'function upgrade(address, address) external',
        ],
        dlcCritical
    );

    const DLCManager = await ethers.getContractFactory('DLCManager');
    const dlcManagerImpl = await DLCManager.deploy();
    await dlcManagerImpl.deployed();

    await connectedProxyAdmin.upgrade(
        MAINNET_ADDRESSES.DLC_MANAGER,
        dlcManagerImpl.address
    );

    console.log('DLCManager upgraded');

    console.log('\n📝 Getting contract instances...');
    const dlcManager = await ethers.getContractAt(
        'DLCManager',
        MAINNET_ADDRESSES.DLC_MANAGER
    );
    const dlcBTC = await ethers.getContractAt(
        'DLCBTC',
        MAINNET_ADDRESSES.DLC_BTC
    );

    await dlcManager.connect(dlcAdmin).setSkipSignatureVerification(true);

    console.log('\n🏗️ Deploying PoolMerchant...');
    const PoolMerchant = await ethers.getContractFactory('PoolMerchant');
    const poolMerchant = await upgrades.deployProxy(PoolMerchant, [
        MAINNET_ADDRESSES.DLC_MANAGER,
        MAINNET_ADDRESSES.DLC_BTC,
        deployer.address,
    ]);
    await poolMerchant.deployed();
    console.log('PoolMerchant deployed to:', poolMerchant.address);

    await dlcManager.connect(dlcAdmin).whitelistAddress(poolMerchant.address);

    console.log('\n🏗️ Deploying MockERC4626Vault...');
    const MockERC4626Vault =
        await ethers.getContractFactory('MockERC4626Vault');
    const mockVault = await MockERC4626Vault.deploy(MAINNET_ADDRESSES.DLC_BTC);
    await mockVault.deployed();
    console.log('MockERC4626Vault deployed to:', mockVault.address);

    console.log('\n🏗️ Deploying IntegrationSample...');
    const IntegrationSample =
        await ethers.getContractFactory('IntegrationSample');
    const rewardRatePerSecond = ethers.utils.parseUnits('1', 8);

    const integrationSample = await IntegrationSample.deploy(
        mockVault.address,
        MAINNET_ADDRESSES.DLC_BTC,
        rewardRatePerSecond,
        poolMerchant.address
    );
    await integrationSample.deployed();
    console.log('IntegrationSample deployed to:', integrationSample.address);

    console.log('\n🔑 Setting up roles and integration...');
    await poolMerchant.grantRole(
        await poolMerchant.ATTESTOR_ROLE(),
        attestor_1.address
    );
    await poolMerchant.grantRole(
        await poolMerchant.ATTESTOR_ROLE(),
        operator.address
    );
    await poolMerchant.grantRole(
        await poolMerchant.OPERATOR_ROLE(),
        operator.address
    );
    await poolMerchant.grantRole(
        await poolMerchant.HARVESTER_ROLE(),
        harvester.address
    );

    console.log('\n🪙 Adding DLCBTC as reward token...');
    await poolMerchant.addRewardToken(MAINNET_ADDRESSES.DLC_BTC);

    console.log('\n🔄 Setting up IntegrationSample...');
    await poolMerchant.setIntegration(integrationSample.address, [
        MAINNET_ADDRESSES.DLC_BTC,
    ]);

    console.log('\n📦 Creating vault with IntegrationSample...');
    const mockBtcTxId = '0x123';
    const mockTaprootPubkey = '0x12345';

    const tx = await poolMerchant
        .connect(attestor_1)
        .createPendingVault(
            mockTaprootPubkey,
            mockBtcTxId,
            integrationSample.address,
            {
                gasLimit: 1000000,
            }
        );

    const receipt = await tx.wait();
    const vaultId = receipt.events.find(
        (e) => e.event === 'PendingVaultCreated'
    ).args.uuid;
    console.log('Vault created with ID:', vaultId);

    console.log('\n💰 Funding vault...');
    const fundAmount = ethers.utils.parseUnits('1', 8);
    console.log('Funding amount:', fundAmount.toString());

    const tx3 = await dlcManager
        .connect(attestor_1)
        .setStatusFunded(vaultId, mockBtcTxId, [], fundAmount);
    await tx3.wait();

    console.log(
        '\n🔄 PoolMerchant transferring dlcBTC to IntegrationSample...'
    );
    await poolMerchant
        .connect(operator)
        .transferDLCBTC(integrationSample.address, fundAmount);
    console.log('Transfer successful');

    console.log('\n📈 Allocating to IntegrationSample...');

    const integrationSharesBefore = await mockVault.balanceOf(
        integrationSample.address
    );
    console.log(
        'IntegrationSample shares before allocation:',
        integrationSharesBefore.toString()
    );

    await poolMerchant.connect(operator).allocateToIntegration(vaultId);

    const shares = await poolMerchant.getVaultShares(vaultId);
    console.log('Allocated shares:', shares.toString());

    const integrationSharesAfter = await mockVault.balanceOf(
        integrationSample.address
    );
    console.log(
        'IntegrationSample shares after allocation:',
        integrationSharesAfter.toString()
    );

    console.log('\n⏳ Mining blocks to accrue rewards...');
    await hre.network.provider.send('hardhat_mine', ['0x100']);

    console.log(
        '\n🏦 Performing partial withdrawal to trigger reward harvest...'
    );
    const withdrawAmount = fundAmount.div(2);
    const sharesToWithdraw = withdrawAmount;

    console.log('\n🔍 Testing withdrawal process...');

    const vaultBefore = await poolMerchant.getVaultAllocationDetails(vaultId);
    const sharesBefore = await poolMerchant.getVaultShares(vaultId);
    console.log('\nInitial state:');
    console.log(' - Total minted:', vaultBefore.valueMinted.toString());
    console.log(' - Allocated:', vaultBefore.allocated.toString());
    console.log(' - Shares:', sharesBefore.toString());

    const assetToken = await ethers.getContractAt(
        'IERC20',
        MAINNET_ADDRESSES.DLC_BTC
    );

    const integrationBalance = await assetToken.balanceOf(
        integrationSample.address
    );
    console.log(
        'IntegrationSample asset balance:',
        integrationBalance.toString()
    );

    const vaultBalance = await assetToken.balanceOf(mockVault.address);
    console.log('MockERC4626Vault asset balance:', vaultBalance.toString());

    console.log(
        '\nAttempting withdrawal of shares:',
        sharesToWithdraw.toString()
    );
    try {
        const integrationAssetBalance = await mockVault.balanceOf(
            integrationSample.address
        );
        console.log(
            'IntegrationSample asset balance before withdrawal:',
            integrationAssetBalance.toString()
        );

        if (integrationAssetBalance.lt(withdrawAmount)) {
            console.log(
                '⚠️ IntegrationSample does not have enough balance to withdraw'
            );
        }

        const withdrawTx = await poolMerchant
            .connect(operator)
            .withdrawFromVault(vaultId, sharesToWithdraw, {
                gasLimit: 2000000,
            });

        await withdrawTx.wait();
        console.log('Withdrawal successful!');

        const vaultAfter =
            await poolMerchant.getVaultAllocationDetails(vaultId);
        const sharesAfter = await poolMerchant.getVaultShares(vaultId);
        console.log('\nPost-withdrawal state:');
        console.log(' - Total minted:', vaultAfter.valueMinted.toString());
        console.log(' - Allocated:', vaultAfter.allocated.toString());
        console.log(' - Shares:', sharesAfter.toString());

        const dlcBTCBalance = await dlcBTC.balanceOf(poolMerchant.address);
        console.log('\nDLCBTC balances:');
        console.log(' - PoolMerchant:', dlcBTCBalance.toString());

        const integrationAssetBalanceAfter = await dlcBTC.balanceOf(
            integrationSample.address
        );
        console.log(
            'IntegrationSample asset balance after withdrawal:',
            integrationAssetBalanceAfter.toString()
        );

        const vaultAssetBalanceAfter = await dlcBTC.balanceOf(
            mockVault.address
        );
        console.log(
            'MockERC4626Vault asset balance after withdrawal:',
            vaultAssetBalanceAfter.toString()
        );
    } catch (error) {
        console.log('\n❌ Withdrawal failed:', error.message);

        const integrationBalanceAfter = await assetToken.balanceOf(
            integrationSample.address
        );
        console.log(
            'IntegrationSample asset balance after withdrawal attempt:',
            integrationBalanceAfter.toString()
        );

        const vaultBalanceAfter = await assetToken.balanceOf(mockVault.address);
        console.log(
            'MockERC4626Vault asset balance after withdrawal attempt:',
            vaultBalanceAfter.toString()
        );
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
