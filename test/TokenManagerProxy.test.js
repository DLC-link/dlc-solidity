const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');
const hardhat = require('hardhat');

function getRoleInBytes(role) {
    return ethers.utils.id(role);
}
const mockUUID =
    '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967';

const Status = {
    READY: 0,
    FUNDED: 1,
    CLOSING: 2,
    CLOSED: 3,
};

xdescribe('TokenManager Proxy', function () {
    let tokenManager, tokenManagerV2, mockDLCManager, dlcBtc;
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

        await dlcBtc.transferOwnership(tokenManager.address);
    });

    it('should deploy', async () => {
        expect(tokenManager.address).to.not.equal(0);
    });

    it('should be the owner of the dlcBTC token contract', async () => {
        expect(await dlcBtc.owner()).to.equal(tokenManager.address);
    });

    describe('Upgrade through proxy', async () => {
        beforeEach(async () => {
            await tokenManager.connect(deployer).setMintFeeRate(1000);

            // test that the newTestFunction does not exist yet
            expect(() => tokenManager.newTestFunction()).to.throw(
                TypeError,
                'tokenManager.newTestFunction is not a function'
            );

            const TokenManagerV2 = await ethers.getContractFactory(
                'TokenManagerV2Test',
                deployer
            );
            tokenManagerV2 = await hardhat.upgrades.upgradeProxy(
                tokenManager.address,
                TokenManagerV2
            );
        });
        it('should upgrade', async () => {
            expect(tokenManagerV2.address).to.not.equal(0);
        });
        it('should still be the owner of the dlcBTC token contract', async () => {
            expect(await dlcBtc.owner()).to.equal(tokenManagerV2.address);
        });
        it('should have the same mint fee rate', async () => {
            expect(await tokenManagerV2.mintFeeRate()).to.equal(1000);
        });
        it('should have the new test function', async () => {
            expect(await tokenManagerV2.newTestFunction()).to.equal(1);
        });
    });
});
