const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const hardhat = require('hardhat');

const { getSignatures, setSigners, whitelistAddress } = require('./utils');

describe('PoolMerchant', () => {
    let poolMerchant;
    let dlcManager;
    let dlcBtc;
    let curveIntegration;
    let curvePool;
    let curveGauge;
    let deployer;
    let attestor_1;
    let attestor_2;
    let attestor_3;
    let attestors;
    let operator;
    let harvester;
    let user;
    let mockIntegration;
    let mockRewardToken;

    const ATTESTOR_ROLE = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes('ATTESTOR_ROLE')
    );
    const OPERATOR_ROLE = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes('OPERATOR_ROLE')
    );
    const HARVESTER_ROLE = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes('HARVESTER_ROLE')
    );

    let btcFeeRecipient = '0x000001';

    beforeEach(async function () {
        [
            deployer,
            attestor_1,
            attestor_2,
            attestor_3,
            operator,
            harvester,
            user,
        ] = await ethers.getSigners();

        attestors = [attestor_1, attestor_2, attestor_3];

        const DLCBTC = await ethers.getContractFactory('DLCBTC', deployer);
        dlcBtc = await hardhat.upgrades.deployProxy(DLCBTC);
        await dlcBtc.deployed();

        // DLCManager
        const DLCManager = await ethers.getContractFactory('DLCManager');
        dlcManager = await hardhat.upgrades.deployProxy(DLCManager, [
            deployer.address,
            deployer.address,
            3,
            dlcBtc.address,
            btcFeeRecipient,
        ]);
        await dlcManager.deployed();
        await dlcBtc.transferOwnership(dlcManager.address);
        await setSigners(dlcManager, attestors);

        // Deploy Mock Integration

        // Deploy Mock Reward Token
        const MockERC20 = await ethers.getContractFactory('MockERC20');
        mockRewardToken = await MockERC20.deploy('Mock Reward', 'MRWD', 18);

        const MockIntegration =
            await ethers.getContractFactory('MockIntegration');
        mockIntegration = await MockIntegration.deploy([
            mockRewardToken.address,
        ]);

        // Deploy PoolMerchant
        const PoolMerchant = await ethers.getContractFactory('PoolMerchant');
        poolMerchant = await upgrades.deployProxy(PoolMerchant, [
            dlcManager.address,
            dlcBtc.address,
            deployer.address,
        ]);

        // Setup roles
        await poolMerchant.grantRole(ATTESTOR_ROLE, attestor_1.address);
        await poolMerchant.grantRole(OPERATOR_ROLE, operator.address);
        await poolMerchant.grantRole(HARVESTER_ROLE, harvester.address);

        await whitelistAddress(dlcManager, poolMerchant);

        // Transfer CurveIntegration ownership to PoolMerchant
        // await curveIntegration.transferOwnership(poolMerchant.address);
    });

    describe('Initialization', function () {
        it('should initialize with correct state', async function () {
            expect(await poolMerchant.dlcManager()).to.equal(
                dlcManager.address
            );
            expect(await poolMerchant.dlcBTC()).to.equal(dlcBtc.address);
            expect(
                await poolMerchant.hasRole(ATTESTOR_ROLE, attestor_1.address)
            ).to.be.true;
            expect(await poolMerchant.hasRole(OPERATOR_ROLE, operator.address))
                .to.be.true;
            expect(
                await poolMerchant.hasRole(HARVESTER_ROLE, harvester.address)
            ).to.be.true;
        });
    });

    describe('Vault Creation', function () {
        it('should create a pending vault', async function () {
            const taprootPubKey = 'taproot123';
            const withdrawalTxId = 'tx123';

            const tx = await poolMerchant
                .connect(attestor_1)
                .createPendingVault(taprootPubKey, withdrawalTxId);
            await expect(tx).to.not.be.reverted;

            const receipt = await tx.wait();
            const event = receipt.events.find(
                (event) => event.event === 'PendingVaultCreated'
            );
            const vaultId = event.args.uuid;

            // Verify vault was created in DLCManager
            const UUID = (await dlcManager.getDLC(vaultId)).uuid;
            expect(UUID).to.equal(vaultId);
        });
    });

    describe('Reward Token Management', function () {
        it('should add reward token', async function () {
            await expect(
                poolMerchant
                    .connect(deployer)
                    .addRewardToken(mockRewardToken.address)
            )
                .to.emit(poolMerchant, 'RewardTokenAdded')
                .withArgs(mockRewardToken.address);

            const rewardToken = await poolMerchant.rewardTokens(
                mockRewardToken.address
            );
            expect(rewardToken.tokenAddress).to.equal(mockRewardToken.address);
            expect(rewardToken.isActive).to.be.true;
        });

        it('should not add same reward token twice', async function () {
            await poolMerchant
                .connect(deployer)
                .addRewardToken(mockRewardToken.address);
            await expect(
                poolMerchant
                    .connect(deployer)
                    .addRewardToken(mockRewardToken.address)
            ).to.be.revertedWith('Token already added');
        });

        it('should only allow admin to add reward tokens', async function () {
            await expect(
                poolMerchant
                    .connect(user)
                    .addRewardToken(mockRewardToken.address)
            ).to.be.reverted;
        });
    });

    describe('Integration Management', function () {
        beforeEach(async function () {
            await poolMerchant
                .connect(deployer)
                .addRewardToken(mockRewardToken.address);
        });

        it('should set integration with supported rewards', async function () {
            await expect(
                poolMerchant
                    .connect(deployer)
                    .setIntegration(mockIntegration.address, [
                        mockRewardToken.address,
                    ])
            )
                .to.emit(poolMerchant, 'IntegrationAdded')
                .withArgs(mockIntegration.address, [mockRewardToken.address]);

            const integration = await poolMerchant.integrations(
                mockIntegration.address
            );
            expect(integration.isActive).to.be.true;
            expect(integration.totalShares).to.equal(0);
            expect(integration.strategy).to.equal(mockIntegration.address);
        });

        it('should not allow setting integration with unsupported reward token', async function () {
            await expect(
                poolMerchant
                    .connect(deployer)
                    .setIntegration(mockIntegration.address, [
                        ethers.constants.AddressZero,
                    ])
            ).to.be.revertedWith('Invalid reward token');
        });

        it('should only allow admin to set integration', async function () {
            await expect(
                poolMerchant
                    .connect(user)
                    .setIntegration(mockIntegration.address, [
                        mockRewardToken.address,
                    ])
            ).to.be.reverted;
        });
    });

    describe('Vault Creation and Management', function () {
        let vaultId;
        const taprootPubKey = 'taproot123';
        const withdrawalTxId = 'tx123';
        const valueLocked = 1000000;

        beforeEach(async function () {
            const tx = await poolMerchant
                .connect(attestor_1)
                .createPendingVault(taprootPubKey, withdrawalTxId);
            const receipt = await tx.wait();
            vaultId = receipt.events.find(
                (event) => event.event === 'PendingVaultCreated'
            ).args.uuid;
        });

        it('should allocate to integration', async function () {
            // Setup integration
            await poolMerchant
                .connect(deployer)
                .addRewardToken(mockRewardToken.address);
            await poolMerchant
                .connect(deployer)
                .setIntegration(mockIntegration.address, [
                    mockRewardToken.address,
                ]);

            const signatureBytesForFunding = await getSignatures(
                {
                    uuid: vaultId,
                    btcTxId: withdrawalTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );
            const tx3 = await dlcManager
                .connect(attestor_1)
                .setStatusFunded(
                    vaultId,
                    withdrawalTxId,
                    signatureBytesForFunding,
                    valueLocked
                );
            await tx3.wait();

            // Allocate
            await expect(
                poolMerchant
                    .connect(operator)
                    .allocateToIntegration(vaultId, mockIntegration.address)
            )
                .to.emit(poolMerchant, 'SharesAllocated')
                .withArgs(vaultId, mockIntegration.address, valueLocked); // Assuming 1:1 share ratio

            const shares = await poolMerchant.getVaultShares(
                vaultId,
                mockIntegration.address
            );
            expect(shares).to.equal(valueLocked);
        });

        it('should not allocate unfunded vault', async function () {
            await poolMerchant
                .connect(deployer)
                .addRewardToken(mockRewardToken.address);
            await poolMerchant
                .connect(deployer)
                .setIntegration(mockIntegration.address, [
                    mockRewardToken.address,
                ]);

            await expect(
                poolMerchant
                    .connect(operator)
                    .allocateToIntegration(vaultId, mockIntegration.address)
            ).to.be.revertedWith('Vault not funded');
        });
    });

    describe('Reward Harvesting and Claims', function () {
        let vaultId;
        let mockRewardToken2;
        const withdrawalTxId = 'tx123';
        const valueLocked = 1000000;
        const initialFunding = ethers.utils.parseUnits('1', 8);

        beforeEach(async function () {
            // Create and fund vault
            const tx = await poolMerchant
                .connect(attestor_1)
                .createPendingVault('taproot123', 'tx123');
            const receipt = await tx.wait();
            vaultId = receipt.events.find(
                (e) => e.event === 'PendingVaultCreated'
            ).args.uuid;
            const signatureBytesForFunding = await getSignatures(
                {
                    uuid: vaultId,
                    btcTxId: withdrawalTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: initialFunding,
                },
                attestors,
                3
            );
            const tx3 = await dlcManager
                .connect(attestor_1)
                .setStatusFunded(
                    vaultId,
                    withdrawalTxId,
                    signatureBytesForFunding,
                    initialFunding
                );
            await tx3.wait();

            // Deploy second mock reward token (unsupported)
            const MockERC20 = await ethers.getContractFactory('MockERC20');
            mockRewardToken2 = await MockERC20.deploy(
                'Mock Reward 2',
                'MRWD2',
                18
            );

            // Deploy integration with both reward tokens
            const MockIntegration =
                await ethers.getContractFactory('MockIntegration');
            mockIntegration = await MockIntegration.deploy([
                mockRewardToken.address,
                mockRewardToken2.address,
            ]);

            // Setup supported reward token and integration
            await poolMerchant
                .connect(deployer)
                .addRewardToken(mockRewardToken.address);
            await poolMerchant
                .connect(deployer)
                .setIntegration(mockIntegration.address, [
                    mockRewardToken.address,
                ]);
            await poolMerchant
                .connect(operator)
                .allocateToIntegration(vaultId, mockIntegration.address);

            // Fund mock integration with rewards
            await mockRewardToken.mint(
                mockIntegration.address,
                ethers.utils.parseEther('100')
            );
            await mockRewardToken2.mint(
                mockIntegration.address,
                ethers.utils.parseEther('100')
            );
        });

        it('should harvest and distribute only supported rewards', async function () {
            // Mock pending rewards in integration
            const supportedAmount = ethers.utils.parseEther('10');
            const unsupportedAmount = ethers.utils.parseEther('5');
            await mockIntegration.mockRewards([
                supportedAmount,
                unsupportedAmount,
            ]);

            await expect(
                poolMerchant
                    .connect(harvester)
                    .harvestRewards(mockIntegration.address)
            )
                .to.emit(poolMerchant, 'RewardsHarvested')
                .withArgs(
                    mockIntegration.address,
                    mockRewardToken.address,
                    harvester.address,
                    supportedAmount
                );

            // Check only supported token was distributed
            const [_, pendingAmount] = await poolMerchant.getVaultReward(
                vaultId,
                mockIntegration.address,
                mockRewardToken.address
            );
            expect(pendingAmount).to.equal(supportedAmount);

            // Verify unsupported token was claimed but not distributed
            expect(
                await mockRewardToken2.balanceOf(poolMerchant.address)
            ).to.equal(unsupportedAmount);
        });

        it('should allow users to claim rewards', async function () {
            await mockIntegration.mockRewards([
                ethers.utils.parseEther('10'),
                ethers.utils.parseEther('5'),
            ]);
            await poolMerchant
                .connect(harvester)
                .harvestRewards(mockIntegration.address);

            await expect(
                poolMerchant
                    .connect(user)
                    .claimRewards(
                        vaultId,
                        mockIntegration.address,
                        mockRewardToken.address
                    )
            )
                .to.emit(poolMerchant, 'RewardsClaimed')
                .withArgs(
                    vaultId,
                    mockIntegration.address,
                    mockRewardToken.address,
                    ethers.utils.parseEther('10')
                );

            // Verify reward was claimed
            const [_, pendingAmount] = await poolMerchant.getVaultReward(
                vaultId,
                mockIntegration.address,
                mockRewardToken.address
            );
            expect(pendingAmount).to.equal(0);
            expect(await mockRewardToken.balanceOf(user.address)).to.equal(
                ethers.utils.parseEther('10')
            );
        });

        it('should handle rewards when no tokens are supported', async function () {
            // Deploy integration with only unsupported reward
            const newIntegration = await (
                await ethers.getContractFactory('MockIntegration')
            ).deploy([mockRewardToken2.address]);

            await poolMerchant
                .connect(deployer)
                .setIntegration(newIntegration.address, []);
            await mockRewardToken2.mint(
                newIntegration.address,
                ethers.utils.parseEther('10')
            );
            await newIntegration.mockRewards([ethers.utils.parseEther('10')]);

            // Should not revert but no rewards distributed
            await poolMerchant
                .connect(harvester)
                .harvestRewards(newIntegration.address);
        });
    });
});
