const hre = require('hardhat');
const { ethers, upgrades } = require('hardhat');

const { getSignatures, whitelistAddress } = require('../test/utils');

async function fundAccount(address) {
    await hre.network.provider.send('hardhat_setBalance', [
        address,
        '0x2000000000000000000', // 2 ETH
    ]);
}

async function main() {
    // Compile contracts
    console.log('\n🔨 Compiling contracts...');
    await hre.run('compile');

    console.log('\n🚀 Starting happy path integration test...');

    // Configure network and addresses
    const MAINNET_ADDRESSES = {
        DLC_MANAGER: '0x20157DBAbb84e3BBFE68C349d0d44E48AE7B5AD2',
        DLC_BTC: '0x050C24dBf1eEc17babE5fc585F06116A259CC77A',
        CURVE_POOL: '0xe957cE03cCdd88f02ed8b05C9a3A28ABEf38514A',
        CURVE_GAUGE: '0x02b8e750E68cb648dB2c2ac4BBb47A10A5c12588',
        CRV_TOKEN: '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978',
    };

    // Impersonate necessary accounts
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

    // DLCManager upgrade remains the same
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

    // Deploy PoolMerchant
    console.log('\n🏗️ Deploying PoolMerchant...');
    const PoolMerchant = await ethers.getContractFactory('PoolMerchant');
    const poolMerchant = await upgrades.deployProxy(PoolMerchant, [
        MAINNET_ADDRESSES.DLC_MANAGER,
        MAINNET_ADDRESSES.DLC_BTC,
        deployer.address,
    ]);
    await poolMerchant.deployed();
    console.log('PoolMerchant deployed to:', poolMerchant.address);

    // Whitelist PoolMerchant
    await dlcManager.connect(dlcAdmin).whitelistAddress(poolMerchant.address);

    // Deploy CurveIntegration
    console.log('\n🏗️ Deploying CurveIntegration...');
    const CurveIntegration =
        await ethers.getContractFactory('CurveIntegration');
    const curveIntegration = await CurveIntegration.deploy(
        MAINNET_ADDRESSES.CURVE_POOL,
        MAINNET_ADDRESSES.CURVE_GAUGE,
        poolMerchant.address,
        MAINNET_ADDRESSES.DLC_BTC
    );
    await curveIntegration.deployed();
    console.log('CurveIntegration deployed to:', curveIntegration.address);

    // Setup roles and integration
    console.log('\n🔑 Setting up roles and integration...');
    await poolMerchant.grantRole(
        await poolMerchant.ATTESTOR_ROLE(),
        attestor_1.address
    );
    await poolMerchant.grantRole(
        await poolMerchant.OPERATOR_ROLE(),
        operator.address
    );
    await poolMerchant.grantRole(
        await poolMerchant.HARVESTER_ROLE(),
        harvester.address
    );

    console.log('\n🪙 Adding CRV as reward token...');
    await poolMerchant.addRewardToken(MAINNET_ADDRESSES.CRV_TOKEN);

    console.log('\n🔄 Setting up CurveIntegration...');
    await poolMerchant.setIntegration(curveIntegration.address, [
        MAINNET_ADDRESSES.CRV_TOKEN,
    ]);

    // Create vault with integration
    console.log('\n📦 Creating vault with Curve integration...');
    const mockBtcTxId = '0x123';
    const mockTaprootPubkey = '0x12345';

    const tx = await poolMerchant
        .connect(attestor_1)
        .createPendingVault(
            mockTaprootPubkey,
            mockBtcTxId,
            curveIntegration.address,
            {
                gasLimit: 1000000,
            }
        );

    const receipt = await tx.wait();
    const vaultId = receipt.events.find(
        (e) => e.event === 'PendingVaultCreated'
    ).args.uuid;
    console.log('Vault created with ID:', vaultId);

    // Fund vault
    console.log('\n💰 Funding vault...');
    const fundAmount = ethers.utils.parseUnits('1', 8); // 1 BTC
    console.log('Funding amount:', fundAmount.toString());

    const tx3 = await dlcManager
        .connect(attestor_1)
        .setStatusFunded(vaultId, mockBtcTxId, [], fundAmount);
    await tx3.wait();

    // Allocate to Curve
    console.log('\n📈 Allocating to Curve...');
    await poolMerchant.connect(operator).allocateToIntegration(vaultId);

    const shares = await poolMerchant.getVaultShares(vaultId);
    console.log('Allocated shares:', shares.toString());

    // Mine blocks and check initial state
    console.log('\n⏳ Mining blocks to accrue rewards...');
    await hre.network.provider.send('hardhat_mine', ['0x100']); // Mine 256 blocks

    // Perform partial withdrawal to trigger reward harvest
    console.log(
        '\n🏦 Performing partial withdrawal to trigger reward harvest...'
    );
    const withdrawAmount = fundAmount.div(2);

    console.log('\n🔍 Testing withdrawal process...');

    // Step 1: Check initial state
    const vaultBefore = await poolMerchant.getVaultAllocationDetails(vaultId);
    const sharesBefore = await poolMerchant.getVaultShares(vaultId);
    console.log('\nInitial state:');
    console.log(' - Total minted:', vaultBefore.valueMinted.toString());
    console.log(' - Allocated:', vaultBefore.allocated.toString());
    console.log(' - Shares:', sharesBefore.toString());

    // Step 2: Perform withdrawal
    console.log('\nAttempting withdrawal of:', withdrawAmount.toString());

    try {
        // First just try the withdrawal
        const withdrawTx = await poolMerchant
            .connect(attestor_1)
            .withdrawFromVault(vaultId, withdrawAmount, {
                gasLimit: 2000000,
            });

        await withdrawTx.wait();
        console.log('Withdrawal successful!');

        // Check post-withdrawal state
        const vaultAfter =
            await poolMerchant.getVaultAllocationDetails(vaultId);
        const sharesAfter = await poolMerchant.getVaultShares(vaultId);
        console.log('\nPost-withdrawal state:');
        console.log(' - Total minted:', vaultAfter.valueMinted.toString());
        console.log(' - Allocated:', vaultAfter.allocated.toString());
        console.log(' - Shares:', sharesAfter.toString());

        // Step 3: Check DLC BTC balances
        const dlcBTCBalance = await dlcBTC.balanceOf(poolMerchant.address);
        console.log('\nDLC BTC balances:');
        console.log(' - PoolMerchant:', dlcBTCBalance.toString());

        // Step 4: Separately check for rewards
        console.log('\n🌾 Checking reward state...');
        const [lastClaimed, pendingAmount] = await poolMerchant.getVaultReward(
            vaultId,
            MAINNET_ADDRESSES.CRV_TOKEN
        );
        console.log('Current reward state:');
        console.log(
            ' - Last claimed:',
            new Date(lastClaimed * 1000).toISOString()
        );
        console.log(
            ' - Pending amount:',
            ethers.utils.formatEther(pendingAmount)
        );

        // Step 5: Try harvesting rewards separately
        console.log('\nTrying manual reward harvest...');
        try {
            await poolMerchant
                .connect(harvester)
                .harvestRewardsForIntegration(curveIntegration.address, {
                    gasLimit: 2000000,
                });
            console.log('Manual harvest successful');
        } catch (harvestError) {
            console.log('Manual harvest failed:', harvestError.message);
        }
    } catch (error) {
        console.log('\n❌ Initial withdrawal failed:', error.message);
    }

    console.log('\n✅ Test sequence complete');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
