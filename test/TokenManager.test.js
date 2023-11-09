const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');

function getRoleInBytes(role) {
    return ethers.utils.id(role);
}
const mockUUID =
    '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967';
const mockAttestorList = [
    'https://attestor1.com',
    'https://attestor2.com',
    'https://attestor3.com',
];

describe('TokenManager', function () {
    let tokenManager, mockDLCManagerV2, dlcBtc;
    let deployer, routerWallet, user, someRandomAccount;

    let deposit = 100000000; // 1 BTC
    let attestorCount = 1;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        routerWallet = accounts[1];
        user = accounts[2];
        someRandomAccount = accounts[3];

        const MockDLCManagerV2 =
            await ethers.getContractFactory('MockDLCManagerV2');
        mockDLCManagerV2 = await MockDLCManagerV2.deploy();
        await mockDLCManagerV2.deployed();

        const DLCBTC = await ethers.getContractFactory('DLCBTC', deployer);
        dlcBtc = await DLCBTC.deploy();
        await dlcBtc.deployed();

        const TokenManager = await ethers.getContractFactory(
            'TokenManager',
            deployer
        );
        tokenManager = await upgrades.deployProxy(TokenManager, [
            mockDLCManagerV2.address,
            dlcBtc.address,
            routerWallet.address,
        ]);

        await dlcBtc.transferOwnership(tokenManager.address);
    });

    it('should deploy', async () => {
        expect(tokenManager.address).to.not.equal(0);
    });

    it('should be the owner of the dlcBTC token contract', async () => {
        expect(await dlcBtc.owner()).to.equal(tokenManager.address);
    });

    describe('admin functions', async () => {
        describe('setRouterWallet', async () => {
            it('reverts on unauthorized calls', async () => {
                await expect(
                    tokenManager
                        .connect(someRandomAccount)
                        .setRouterWallet(someRandomAccount.address)
                ).to.be.revertedWithCustomError(tokenManager, 'NotDLCAdmin');
            });
            it('should set router wallet', async () => {
                await tokenManager
                    .connect(deployer)
                    .setRouterWallet(someRandomAccount.address);
                expect(await tokenManager.routerWalletAddress()).to.equal(
                    someRandomAccount.address
                );
            });
        });
        describe('setMinimumDeposit', async () => {
            it('reverts on unauthorized calls', async () => {
                await expect(
                    tokenManager
                        .connect(someRandomAccount)
                        .setMinimumDeposit(someRandomAccount.address)
                ).to.be.revertedWithCustomError(tokenManager, 'NotDLCAdmin');
            });
            it('should set minimum deposit', async () => {
                await tokenManager.connect(deployer).setMinimumDeposit(1000);
                expect(await tokenManager.minimumDeposit()).to.equal(1000);
            });
        });
        describe('setMaximumDeposit', async () => {
            it('reverts on unauthorized calls', async () => {
                await expect(
                    tokenManager
                        .connect(someRandomAccount)
                        .setMaximumDeposit(someRandomAccount.address)
                ).to.be.revertedWithCustomError(tokenManager, 'NotDLCAdmin');
            });
            it('should set maximum deposit', async () => {
                await tokenManager.connect(deployer).setMaximumDeposit(1000);
                expect(await tokenManager.maximumDeposit()).to.equal(1000);
            });
        });
        describe('setFeeRate', async () => {
            it('reverts on unauthorized calls', async () => {
                await expect(
                    tokenManager
                        .connect(someRandomAccount)
                        .setFeeRate(someRandomAccount.address)
                ).to.be.revertedWithCustomError(tokenManager, 'NotDLCAdmin');
            });
            it('should set fee rate', async () => {
                await tokenManager.connect(deployer).setFeeRate(1000);
                expect(await tokenManager.feeRate()).to.equal(1000);
            });
        });
        describe('pauseContract', async () => {
            it('is only callable by PAUSER_ROLE', async () => {
                await expect(
                    tokenManager.connect(someRandomAccount).pauseContract()
                ).to.be.revertedWithCustomError(tokenManager, 'NotPauser');

                await tokenManager
                    .connect(deployer)
                    .grantRole(
                        getRoleInBytes('PAUSER_ROLE'),
                        someRandomAccount.address
                    );

                await expect(
                    tokenManager.connect(someRandomAccount).pauseContract()
                ).not.to.be.reverted;
            });
        });
    });
    describe('setupVault', async () => {
        it('reverts when called by non-whitelisted address', async () => {
            await expect(
                tokenManager.connect(user).setupVault(deposit, attestorCount)
            ).to.be.revertedWithCustomError(tokenManager, 'NotWhitelisted');
        });

        it('is only callable when contract is unpaused', async () => {
            await tokenManager.connect(deployer).whitelistAddress(user.address);
            await tokenManager.connect(deployer).pauseContract();
            await expect(
                tokenManager.connect(user).setupVault(deposit, attestorCount)
            ).to.be.revertedWith('Pausable: paused');
        });
        it('reverts when deposit is too small', async () => {
            await tokenManager.connect(deployer).whitelistAddress(user.address);
            let _deposit = 10;
            await expect(
                tokenManager.connect(user).setupVault(_deposit, attestorCount)
            ).to.be.revertedWithCustomError(tokenManager, 'DepositTooSmall');
        });
        it('reverts when deposit is too large', async () => {
            await tokenManager.connect(deployer).whitelistAddress(user.address);
            let _deposit = 1000000001;
            await expect(
                tokenManager.connect(user).setupVault(_deposit, attestorCount)
            ).to.be.revertedWithCustomError(tokenManager, 'DepositTooLarge');
        });
        it('emits an event with the vault details', async () => {
            await tokenManager.connect(deployer).whitelistAddress(user.address);
            const tx = await tokenManager
                .connect(user)
                .setupVault(deposit, attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (ev) => ev.event === 'SetupVault'
            );
            expect(event.args).to.eql([
                mockUUID,
                BigNumber.from(deposit),
                mockAttestorList,
                user.address,
            ]);
        });
        it('stores the _uuid in the userVaults map', async () => {
            await tokenManager.connect(deployer).whitelistAddress(user.address);
            const tx = await tokenManager
                .connect(user)
                .setupVault(deposit, attestorCount);
            await tx.wait();
            expect(await tokenManager.userVaults(user.address, 0)).to.equal(
                mockUUID
            );
        });
        it('stores the vault details on the manager contract', async () => {
            await tokenManager.connect(deployer).whitelistAddress(user.address);
            const tx = await tokenManager
                .connect(user)
                .setupVault(deposit, attestorCount);
            await tx.wait();
            // console.log(
            //     await tokenManager.getAllVaultUUIDsForAddress(user.address)
            // );
            const vault = await tokenManager.getVault(mockUUID);
            expect(vault.uuid).to.equal(mockUUID);
            expect(vault.attestorList).to.eql(mockAttestorList);
            expect(vault.protocolWallet).to.equal(routerWallet.address);
            expect(vault.protocolContract).to.equal(tokenManager.address);
            expect(vault.valueLocked).to.equal(BigNumber.from(deposit));
            expect(vault.creator).to.equal(user.address);
            expect(vault.outcome).to.equal(BigNumber.from(0));
            expect(vault.status).to.equal(0);
            expect(vault.fundingTxId).to.equal('');
            expect(vault.closingTxId).to.equal('');
        });
        xit('emits the correct event', async () => {});
    });
    describe('setStatusFunded', async () => {
        it('is only callable when contract is unpaused', async () => {
            await tokenManager.connect(deployer).pauseContract();
            await expect(
                tokenManager.connect(user).setStatusFunded(mockUUID, 'someTx')
            ).to.be.revertedWith('Pausable: paused');
        });
        it('reverts when called unauthorized', async () => {
            await expect(
                tokenManager.setStatusFunded(mockUUID, 'someTx')
            ).to.be.revertedWithCustomError(
                tokenManager,
                'NotDLCManagerContract'
            );
        });
        it('mint dlcBTC tokens to the user', async () => {
            await tokenManager.connect(deployer).whitelistAddress(user.address);
            const tx = await tokenManager
                .connect(user)
                .setupVault(deposit, attestorCount);
            await tx.wait();
            const tx2 = await mockDLCManagerV2
                .connect(routerWallet)
                .setStatusFunded(mockUUID, 'someTx');
            await tx2.wait();
            expect(await dlcBtc.balanceOf(user.address)).to.equal(
                BigNumber.from(deposit)
            );
        });
    });
    describe('closeVault', async () => {
        it('is only callable when contract is unpaused', async () => {
            await tokenManager.connect(deployer).pauseContract();
            await expect(
                tokenManager.connect(user).closeVault(mockUUID)
            ).to.be.revertedWith('Pausable: paused');
        });
        it('reverts when called unauthorized', async () => {
            await expect(
                tokenManager.connect(someRandomAccount).closeVault(mockUUID)
            ).to.be.revertedWithCustomError(tokenManager, 'NotOwner');
        });
    });
    describe('postCloseDLCHandler', async () => {
        it('is only callable when contract is unpaused', async () => {
            await tokenManager.connect(deployer).pauseContract();
            await expect(
                tokenManager
                    .connect(user)
                    .postCloseDLCHandler(mockUUID, 'someTx')
            ).to.be.revertedWith('Pausable: paused');
        });
    });
});