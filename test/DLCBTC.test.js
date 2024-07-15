const { expect } = require('chai');
const { ethers } = require('hardhat');

const { getSignatures, setSigners } = require('./utils');

const mockUUID =
    '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967';
const mockBTCTxId =
    '0x1234567890123456789012345678901234567890123456789012345678901234';
const mockTaprootPubkey =
    '0x1234567890123456789012345678901234567890123456789012345678901234';

describe('DLCBTC', function () {
    let dlcBtc, dlcManager;
    let deployer, user, someRandomAccount;
    let attestor1, attestor2, attestor3;
    let attestors;

    let deposit = 100000000; // 1 BTC
    let btcFeeRecipient = '0x000001';

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        user = accounts[2];
        someRandomAccount = accounts[3];

        attestor1 = accounts[6];
        attestor2 = accounts[7];
        attestor3 = accounts[8];
        attestors = [attestor1, attestor2, attestor3];

        const DLCBTC = await ethers.getContractFactory('DLCBTC', deployer);
        dlcBtc = await upgrades.deployProxy(DLCBTC);
        await dlcBtc.deployed();

        // DLCManager
        const DLCManager = await ethers.getContractFactory('DLCManager');
        dlcManager = await upgrades.deployProxy(DLCManager, [
            deployer.address,
            deployer.address,
            3,
            dlcBtc.address,
            btcFeeRecipient,
        ]);
        await dlcManager.deployed();
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
            dlcBtc.connect(user)['mint(address,uint256)'](user.address, deposit)
        ).to.be.revertedWithCustomError(dlcBtc, 'NotAuthorized');
    });

    it('should revert on unauthorized burn', async () => {
        await expect(
            dlcBtc.connect(user)['burn(address,uint256)'](user.address, deposit)
        ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('owner can mint tokens', async () => {
        await dlcBtc['mint(address,uint256)'](user.address, deposit);
        expect(await dlcBtc.balanceOf(user.address)).to.equal(deposit);
    });

    it('owner can burn tokens', async () => {
        await dlcBtc['mint(address,uint256)'](user.address, deposit);
        await dlcBtc['burn(address,uint256)'](user.address, deposit);
        expect(await dlcBtc.balanceOf(user.address)).to.equal(0);
    });

    describe('after Ownership transfer', async () => {
        beforeEach(async () => {
            await dlcBtc['mint(address,uint256)'](user.address, deposit);
            await dlcBtc.transferOwnership(dlcManager.address);
        });

        it('should be owned by dlcManager', async () => {
            expect(await dlcBtc.owner()).to.equal(dlcManager.address);
        });

        it('should revert on mint called by previous owner', async () => {
            await expect(
                dlcBtc
                    .connect(deployer)
                    ['mint(address,uint256)'](user.address, deposit)
            ).to.be.revertedWithCustomError(dlcBtc, 'NotAuthorized');
        });

        it('should revert on burn called by previous owner', async () => {
            await expect(
                dlcBtc
                    .connect(deployer)
                    ['burn(address,uint256)'](user.address, deposit)
            ).to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('dlcManager can mint tokens', async () => {
            const existingBalance = await dlcBtc.balanceOf(user.address);
            await dlcManager.connect(deployer).whitelistAddress(user.address);
            const tx = await dlcManager.connect(user).setupVault();
            const receipt = await tx.wait();
            const _uuid = await receipt.events[0].args.uuid;

            await setSigners(dlcManager, attestors);
            const signatureBytesForPending = await getSignatures(
                {
                    uuid: _uuid,
                    btcTxId: mockBTCTxId,
                    functionString: 'set-status-redeem-pending',
                    newLockedAmount: 0,
                },
                attestors,
                3
            );
            const signatureBytesForFunding = await getSignatures(
                {
                    uuid: _uuid,
                    btcTxId: mockBTCTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: deposit,
                },
                attestors,
                3
            );
            const tx2 = await dlcManager
                .connect(attestor1)
                .setStatusPending(
                    _uuid,
                    mockBTCTxId,
                    signatureBytesForPending,
                    0
                );
            await tx2.wait();
            const tx3 = await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    _uuid,
                    mockBTCTxId,
                    signatureBytesForFunding,
                    mockTaprootPubkey,
                    deposit
                );
            await tx3.wait();
            const expectedBalance = ethers.BigNumber.from(existingBalance).add(
                ethers.BigNumber.from(deposit)
            );
            expect(await dlcBtc.balanceOf(user.address)).to.equal(
                expectedBalance
            );
        });

        it('dlcManager can blacklist addresses', async () => {
            await dlcManager.blacklistOnTokenContract(user.address);
            await expect(
                dlcBtc
                    .connect(user)
                    .transfer(someRandomAccount.address, deposit)
            ).to.be.revertedWithCustomError(dlcBtc, 'BlacklistedSender');

            await expect(
                dlcBtc
                    .connect(someRandomAccount)
                    .transfer(user.address, deposit)
            ).to.be.revertedWithCustomError(dlcBtc, 'BlacklistedRecipient');
        });

        xit('dlcManager can burn tokens', async () => {
            const existingBalance = await dlcBtc.balanceOf(user.address);
            await dlcManager.connect(deployer).whitelistAddress(user.address);
            const tx = await dlcManager.connect(user).setupVault();
            const receipt = await tx.wait();
            const _uuid = await receipt.events[0].args.uuid;

            await setSigners(dlcManager, attestors);
            const signatureBytes = await getSignatures(
                {
                    uuid: _uuid,
                    btcTxId: mockBTCTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: deposit,
                },
                attestors,
                3
            );
            const tx2 = await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    _uuid,
                    mockBTCTxId,
                    signatureBytes,
                    mockTaprootPubkey,
                    deposit
                );
            await tx2.wait();

            expect(await dlcBtc.balanceOf(user.address)).to.equal(
                ethers.BigNumber.from(existingBalance).add(
                    ethers.BigNumber.from(deposit)
                )
            );
            const tx3 = await dlcManager
                .connect(user)
                .withdraw(mockUUID, deposit);
            await tx3.wait();

            expect(await dlcBtc.balanceOf(user.address)).to.equal(
                existingBalance
            );
        });
    });
});
