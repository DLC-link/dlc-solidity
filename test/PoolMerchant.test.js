const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const hardhat = require('hardhat');

const { getSignatures, setSigners, whitelistAddress } = require('./utils');

async function getEventArg(tx, eventName, argName) {
    const receipt = await tx.wait();
    const event = receipt.events.find((e) => e.event === eventName);
    return event.args[argName];
}

describe('PoolMerchant', () => {
    let poolMerchant;
    let dlcManager;
    let dlcBtc;
    let deployer;
    let attestor_1;
    let attestor_2;
    let attestor_3;
    let attestors;
    let harvester;
    let user;
    let mockIntegration;
    let mockRewardToken;
    const mockTaprootPubkey = 'taproot123';
    const mockWithdrawalTxId = 'tx123';

    const ATTESTOR_ROLE = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes('ATTESTOR_ROLE')
    );
    const HARVESTER_ROLE = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes('HARVESTER_ROLE')
    );

    let btcFeeRecipient = '0x000001';

    beforeEach(async function () {
        [deployer, attestor_1, attestor_2, attestor_3, harvester, user] =
            await ethers.getSigners();

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
        await poolMerchant.grantRole(HARVESTER_ROLE, harvester.address);

        await whitelistAddress(dlcManager, poolMerchant);
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
            expect(
                await poolMerchant.hasRole(HARVESTER_ROLE, harvester.address)
            ).to.be.true;
        });
    });

    describe('Vault Creation and Integration', function () {
        beforeEach(async function () {
            await poolMerchant
                .connect(deployer)
                .addRewardToken(mockRewardToken.address);
            await poolMerchant
                .connect(deployer)
                .setIntegration(mockIntegration.address, [
                    mockRewardToken.address,
                ]);
        });

        it('should create a pending vault with integration', async function () {
            const tx = await poolMerchant
                .connect(attestor_1)
                .createPendingVault(
                    mockTaprootPubkey,
                    mockWithdrawalTxId,
                    mockIntegration.address
                );

            const uuid = await getEventArg(tx, 'PendingVaultCreated', 'uuid');

            await expect(tx)
                .to.emit(poolMerchant, 'PendingVaultCreated')
                .withArgs(
                    uuid,
                    mockTaprootPubkey,
                    mockWithdrawalTxId,
                    mockIntegration.address
                );

            const vaultId = await poolMerchant.getVaultByTaprootAndIntegration(
                mockTaprootPubkey,
                mockIntegration.address
            );
            expect(vaultId).to.equal(uuid);

            expect(
                await poolMerchant.getVaultIntegrationByTaprootAndIntegration(
                    mockTaprootPubkey,
                    mockIntegration.address
                )
            ).to.equal(mockIntegration.address);
        });

        it('should not create vault with inactive integration', async function () {
            const MockIntegration =
                await ethers.getContractFactory('MockIntegration');
            const newIntegration = await MockIntegration.deploy([
                mockRewardToken.address,
            ]);

            await expect(
                poolMerchant
                    .connect(attestor_1)
                    .createPendingVault(
                        mockTaprootPubkey,
                        mockWithdrawalTxId,
                        newIntegration.address
                    )
            ).to.be.revertedWith('Integration not active');
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

    describe('Allocation and Rewards', function () {
        const initialFunding = ethers.utils.parseUnits('1', 8);

        beforeEach(async function () {
            // Setup integration
            await poolMerchant
                .connect(deployer)
                .addRewardToken(mockRewardToken.address);
            await poolMerchant
                .connect(deployer)
                .setIntegration(mockIntegration.address, [
                    mockRewardToken.address,
                ]);

            // Create vault
            const tx = await poolMerchant
                .connect(attestor_1)
                .createPendingVault(
                    mockTaprootPubkey,
                    mockWithdrawalTxId,
                    mockIntegration.address
                );

            const vaultId = await getEventArg(
                tx,
                'PendingVaultCreated',
                'uuid'
            );

            // Fund vault
            const signatureBytesForFunding = await getSignatures(
                {
                    uuid: vaultId,
                    btcTxId: mockWithdrawalTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: initialFunding,
                },
                attestors,
                3
            );
            await dlcManager
                .connect(attestor_1)
                .setStatusFunded(
                    vaultId,
                    mockWithdrawalTxId,
                    signatureBytesForFunding,
                    initialFunding
                );
        });

        it('should allocate to integration', async function () {
            const vaultId = await poolMerchant.getVaultByTaprootAndIntegration(
                mockTaprootPubkey,
                mockIntegration.address
            );

            await expect(
                poolMerchant
                    .connect(attestor_1)
                    .allocateToIntegration(
                        mockTaprootPubkey,
                        mockIntegration.address
                    )
            )
                .to.emit(poolMerchant, 'SharesAllocated')
                .withArgs(vaultId, mockIntegration.address, initialFunding);

            const shares =
                await poolMerchant.getVaultSharesByTaprootAndIntegration(
                    mockTaprootPubkey,
                    mockIntegration.address
                );
            expect(shares).to.equal(initialFunding);

            const details =
                await poolMerchant.getVaultAllocationDetailsByTaprootAndIntegration(
                    mockTaprootPubkey,
                    mockIntegration.address
                );
            expect(details.allocated).to.equal(initialFunding);
            expect(details.unallocated).to.equal(0);
        });

        it('should harvest rewards during withdrawal', async function () {
            // First allocate
            await poolMerchant
                .connect(attestor_1)
                .allocateToIntegration(
                    mockTaprootPubkey,
                    mockIntegration.address
                );

            // Mock some rewards
            const rewardAmount = ethers.utils.parseEther('10');
            await mockRewardToken.mint(mockIntegration.address, rewardAmount);
            await mockIntegration.mockRewards([rewardAmount]);

            const withdrawAmount = initialFunding.div(2);
            const vaultId = await poolMerchant.getVaultByTaprootAndIntegration(
                mockTaprootPubkey,
                mockIntegration.address
            );

            await expect(
                poolMerchant
                    .connect(attestor_1)
                    .withdrawFromVault(
                        mockTaprootPubkey,
                        mockIntegration.address,
                        withdrawAmount
                    )
            )
                .to.emit(poolMerchant, 'RewardsHarvested')
                .withArgs(
                    mockIntegration.address,
                    mockRewardToken.address,
                    poolMerchant.address,
                    rewardAmount
                )
                .and.to.emit(poolMerchant, 'VaultWithdrawn')
                .withArgs(vaultId, withdrawAmount);

            const [_, pendingAmount] =
                await poolMerchant.getVaultRewardByTaprootAndIntegration(
                    mockTaprootPubkey,
                    mockIntegration.address,
                    mockRewardToken.address
                );
            expect(pendingAmount).to.equal(rewardAmount);
        });

        it('should still allow manual reward harvesting by harvester', async function () {
            await poolMerchant
                .connect(attestor_1)
                .allocateToIntegration(
                    mockTaprootPubkey,
                    mockIntegration.address
                );

            const rewardAmount = ethers.utils.parseEther('10');
            await mockRewardToken.mint(mockIntegration.address, rewardAmount);
            await mockIntegration.mockRewards([rewardAmount]);

            await expect(
                poolMerchant
                    .connect(harvester)
                    .harvestRewardsForIntegration(mockIntegration.address)
            )
                .to.emit(poolMerchant, 'RewardsHarvested')
                .withArgs(
                    mockIntegration.address,
                    mockRewardToken.address,
                    poolMerchant.address,
                    rewardAmount
                );
        });
    });
});
