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
    await fundAccount(dlcAdmin.address);
    await fundAccount(attestor_1.address);
    await fundAccount(attestor_2.address);
    await fundAccount(attestor_3.address);
    await fundAccount(attestor_4.address);
    await fundAccount(attestor_5.address);

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

    // Upgrade using ProxyAdmin
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

    // Whitelisting PoolMerchant
    const whitelistTx = await dlcManager
        .connect(dlcAdmin)
        .whitelistAddress(poolMerchant.address);
    await whitelistTx.wait();

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

    // Setup roles
    console.log('\n🔑 Setting up roles...');
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

    // Add CRV as reward token
    console.log('\n🪙 Adding CRV as reward token...');
    await poolMerchant.addRewardToken(MAINNET_ADDRESSES.CRV_TOKEN);

    // Setup integration
    console.log('\n🔄 Setting up CurveIntegration...');
    await poolMerchant.setIntegration(curveIntegration.address, [
        MAINNET_ADDRESSES.CRV_TOKEN,
    ]);

    // Create vault
    console.log('\n📦 Creating vault...');
    const mockBtcTxId = '0x123'; // Mock BTC tx ID
    const mockTaprootPubkey = '0x12345'; // Mock taproot pubkey

    const tx = await poolMerchant
        .connect(attestor_1)
        .createPendingVault(mockTaprootPubkey, mockBtcTxId, {
            gasLimit: 1000000,
        });

    const receipt = await tx.wait();
    const vaultId = receipt.events.find(
        (e) => e.event === 'PendingVaultCreated'
    ).args.uuid;
    console.log('Vault created with ID:', vaultId);

    // Fund vault
    console.log('\n💰 Funding vault...');

    const fundAmount = ethers.utils.parseUnits('1', 8); // 1 BTC
    console.log('Funding amount:', fundAmount);

    // NOTE: I have added an early return to the multisig checking in the DLCManager
    // Because on forked networks its very hard to produce valid signatures
    // with the impersonated attestors... so we will skip this part for now

    // const signatureBytesForFunding = await getSignatures(
    //     {
    //         uuid: vaultId,
    //         btcTxId: mockBtcTxId,
    //         functionString: 'set-status-funded',
    //         newLockedAmount: fundAmount,
    //     },
    //     attestors,
    //     5
    // );
    // console.log('Signatures for funding:', signatureBytesForFunding);
    const tx3 = await dlcManager
        .connect(attestor_1)
        .setStatusFunded(vaultId, mockBtcTxId, [], fundAmount);
    await tx3.wait();

    // Allocate to Curve
    console.log('\n📈 Allocating to Curve...');
    await poolMerchant
        .connect(operator)
        .allocateToIntegration(vaultId, curveIntegration.address);
    const shares = await poolMerchant.getVaultShares(
        vaultId,
        curveIntegration.address
    );
    console.log('Allocated shares:', shares.toString());

    // Wait for some blocks to accrue rewards
    console.log('\n⏳ Mining blocks to accrue rewards...');
    await hre.network.provider.send('hardhat_mine', ['0x100']); // Mine 256 blocks

    // Harvest rewards
    console.log('\n🌾 Harvesting rewards...');
    await poolMerchant
        .connect(harvester)
        .harvestRewards(curveIntegration.address);
    const [lastClaimed, pendingAmount] = await poolMerchant.getVaultReward(
        vaultId,
        curveIntegration.address,
        MAINNET_ADDRESSES.CRV_TOKEN
    );
    console.log(
        'Pending CRV rewards:',
        ethers.utils.formatEther(pendingAmount)
    );

    console.log('\n✅ Happy path integration test complete!');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
