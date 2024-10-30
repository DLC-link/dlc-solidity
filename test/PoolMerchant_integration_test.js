const hre = require('hardhat');
const { ethers, upgrades } = require('hardhat');

async function main() {
    console.log('\n🚀 Starting happy path integration test...');

    // Configure network and addresses
    const MAINNET_ADDRESSES = {
        DLC_MANAGER: '0x...', // Add real address
        DLC_BTC: '0x...', // Add real address
        CURVE_POOL: '0x...', // Add real address
        CURVE_GAUGE: '0x...', // Add real address
        CRV_TOKEN: '0x...', // Add real address
    };

    // Impersonate necessary accounts
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const attestor = await ethers.getImpersonatedSigner('0x...'); // Add real attestor
    const operator = await ethers.getImpersonatedSigner('0x...'); // Add real operator
    const harvester = await ethers.getImpersonatedSigner('0x...'); // Add real harvester

    console.log('\n📝 Getting contract instances...');
    const dlcManager = await ethers.getContractAt(
        'DLCManager',
        MAINNET_ADDRESSES.DLC_MANAGER
    );
    const dlcBTC = await ethers.getContractAt(
        'DLCBTC',
        MAINNET_ADDRESSES.DLC_BTC
    );

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
        attestor.address
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
    const tx = await poolMerchant
        .connect(attestor)
        .createPendingVault('taproot123', 'tx123');
    const receipt = await tx.wait();
    const vaultId = receipt.events.find(
        (e) => e.event === 'PendingVaultCreated'
    ).args.uuid;
    console.log('Vault created with ID:', vaultId);

    // Fund vault (mock)
    console.log('\n💰 Funding vault...');
    const fundAmount = ethers.utils.parseUnits('1', 8); // 1 BTC
    await dlcManager.connect(attestor).mockFundVault(vaultId, fundAmount);

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
