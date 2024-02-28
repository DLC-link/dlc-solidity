const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');

function getRoleInBytes(role) {
    return ethers.utils.id(role);
}
const mockUUID =
    '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967';

describe('DLCBTC', function () {
    let tokenManager, mockDLCManager, dlcBtc;
    let deployer, user, someRandomAccount;

    let deposit = 100000000; // 1 BTC
    let btcFeeRecipient = '0x000001';
    let btcFee = 100;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        user = accounts[2];
        someRandomAccount = accounts[3];

        const MockDLCManager =
            await ethers.getContractFactory('MockDLCManager');
        mockDLCManager = await MockDLCManager.deploy();
        await mockDLCManager.deployed();

        const DLCBTC = await ethers.getContractFactory('DLCBTC', deployer);
        dlcBtc = await DLCBTC.deploy();
        await dlcBtc.deployed();

        const TokenManager = await ethers.getContractFactory(
            'TokenManager',
            deployer
        );
        tokenManager = await upgrades.deployProxy(TokenManager, [
            deployer.address,
            mockDLCManager.address,
            dlcBtc.address,
            btcFeeRecipient,
        ]);
    });

    it('should deploy', async () => {
        expect(dlcBtc.address).to.not.equal(0);
    });

    it('should be owned by deployer at start', async () => {
        expect(await dlcBtc.owner()).to.equal(deployer.address);
    });

    it('should have 8 decimals', async () => {
        expect(await dlcBtc.decimals()).to.equal(8);
    });

    it('should have 0 total supply', async () => {
        expect(await dlcBtc.totalSupply()).to.equal(0);
    });

    it('should revert on unauthorized mint', async () => {
        await expect(
            dlcBtc.connect(user).mint(user.address, deposit)
        ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert on unauthorized burn', async () => {
        await expect(
            dlcBtc.connect(user).burn(user.address, deposit)
        ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('owner can mint tokens', async () => {
        await dlcBtc.mint(user.address, deposit);
        expect(await dlcBtc.balanceOf(user.address)).to.equal(deposit);
    });

    it('owner can burn tokens', async () => {
        await dlcBtc.mint(user.address, deposit);
        await dlcBtc.burn(user.address, deposit);
        expect(await dlcBtc.balanceOf(user.address)).to.equal(0);
    });

    describe('after Ownership transfer', async () => {
        beforeEach(async () => {
            await dlcBtc.transferOwnership(tokenManager.address);
        });

        it('should be owned by TokenManager', async () => {
            expect(await dlcBtc.owner()).to.equal(tokenManager.address);
        });

        it('should revert on mint called by previous owner', async () => {
            await expect(
                dlcBtc.connect(deployer).mint(user.address, deposit)
            ).to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('should revert on burn called by previous owner', async () => {
            await expect(
                dlcBtc.connect(deployer).burn(user.address, deposit)
            ).to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('TokenManager can mint tokens', async () => {
            await tokenManager.connect(deployer).whitelistAddress(user.address);
            const tx = await tokenManager.connect(user).setupVault(deposit);
            await tx.wait();
            const tx2 = await mockDLCManager.setStatusFunded(
                mockUUID,
                'someTx'
            );
            await tx2.wait();
            expect(await dlcBtc.balanceOf(user.address)).to.equal(deposit);
        });

        it('TokenManager can burn tokens', async () => {
            await tokenManager.connect(deployer).whitelistAddress(user.address);
            const tx = await tokenManager.connect(user).setupVault(deposit);
            await tx.wait();
            const tx2 = await mockDLCManager.setStatusFunded(
                mockUUID,
                'someTx'
            );
            await tx2.wait();

            expect(await dlcBtc.balanceOf(user.address)).to.equal(deposit);
            const tx3 = await tokenManager.connect(user).closeVault(mockUUID);
            await tx3.wait();

            expect(await dlcBtc.balanceOf(user.address)).to.equal(0);
        });
    });
});
