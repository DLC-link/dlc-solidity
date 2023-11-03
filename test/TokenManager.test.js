const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');
const web3 = require('web3');

// This is to test the implementation contract of TokenManager

describe('TokenManager', function () {
    let tokenManager, mockDLCManagerV2, dlcBtc;
    let deployer, routerWallet, user, someRandomAccount;

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

    describe('admin functions', async () => {
        it('revert on unauthorized calls', async () => {
            await expect(
                tokenManager
                    .connect(someRandomAccount)
                    .setRouterWallet(someRandomAccount.address)
            ).to.be.revertedWithCustomError(tokenManager, 'NotDLCAdmin');
        });
        describe('setRouterWallet', async () => {
            it('should set router wallet', async () => {
                await tokenManager
                    .connect(deployer)
                    .setRouterWallet(someRandomAccount.address);
                expect(await tokenManager.routerWalletAddress()).to.equal(
                    someRandomAccount.address
                );
            });
        });
    });
});
