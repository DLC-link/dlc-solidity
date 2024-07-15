const { expect } = require('chai');
const { ethers } = require('hardhat');
const hardhat = require('hardhat');
const crypto = require('crypto');

const { getSignatures, setSigners } = require('./utils');

async function whitelistAddress(dlcManager, user) {
    await dlcManager.whitelistAddress(user.address);
}

describe('DLCManager', () => {
    let dlcManager, dlcBtc;
    let accounts, deployer, user, randomAccount, anotherAccount;
    let attestor1, attestor2, attestor3;
    let attestors;

    const valueLocked = 100000000; // 1 BTC
    const btcTxId = '0x1234567890';
    const btcTxId2 = '0x1234567891';
    const mockTaprootPubkey =
        '0x1234567890123456789012345678901234567890123456789012345678901234';
    let btcFeeRecipient = '0x000001';

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        protocol = accounts[1];
        user = accounts[3];
        randomAccount = accounts[4];
        anotherAccount = accounts[5];

        attestor1 = accounts[6];
        attestor2 = accounts[7];
        attestor3 = accounts[8];
        attestors = [attestor1, attestor2, attestor3];

        const DLCBTC = await ethers.getContractFactory('DLCBTC', deployer);
        dlcBtc = await upgrades.deployProxy(DLCBTC);
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
    });

    describe('test contracts are deployed correctly', async () => {
        it('deploys DLCManager correctly', async () => {
            expect(dlcManager.address).to.not.equal(0);
        });

        it('should be the owner of the dlcBTC token contract', async () => {
            expect(await dlcBtc.owner()).to.equal(dlcManager.address);
        });
    });

    describe('contract is pausable', async () => {
        beforeEach(async () => {
            await dlcManager.pauseContract();
        });
        it('reverts correctly when paused', async () => {
            await expect(
                dlcManager.connect(user).setupVault()
            ).to.be.revertedWith('Pausable: paused');
        });
        it('allows functions when unpaused', async () => {
            await dlcManager.unpauseContract();
            await expect(
                dlcManager.connect(user).setupVault()
            ).to.not.be.revertedWith('Pausable: paused');
        });
    });

    describe('setMinimumDeposit', async () => {
        it('reverts on unauthorized calls', async () => {
            await expect(
                dlcManager
                    .connect(randomAccount)
                    .setMinimumDeposit(randomAccount.address)
            ).to.be.revertedWithCustomError(dlcManager, 'NotDLCAdmin');
        });
        it('should set minimum deposit', async () => {
            await dlcManager.connect(deployer).setMinimumDeposit(1000);
            expect(await dlcManager.minimumDeposit()).to.equal(1000);
        });
    });

    describe('setMaximumDeposit', async () => {
        it('reverts on unauthorized calls', async () => {
            await expect(
                dlcManager
                    .connect(randomAccount)
                    .setMaximumDeposit(randomAccount.address)
            ).to.be.revertedWithCustomError(dlcManager, 'NotDLCAdmin');
        });
        it('should set maximum deposit', async () => {
            await dlcManager.connect(deployer).setMaximumDeposit(1000);
            expect(await dlcManager.maximumDeposit()).to.equal(1000);
        });
    });

    describe('setThreshold', async () => {
        it('reverts if called by a non-admin', async () => {
            await expect(
                dlcManager.connect(user).setThreshold(4)
            ).to.be.revertedWithCustomError(dlcManager, 'NotDLCAdmin');
        });

        it('reverts if threshold is set below minimum threshold', async () => {
            await expect(
                dlcManager.connect(deployer).setThreshold(0)
            ).to.be.revertedWithCustomError(dlcManager, 'ThresholdTooLow');
        });

        it('emits a SetThreshold event with the correct data', async () => {
            const tx = await dlcManager.connect(deployer).setThreshold(4);
            const receipt = await tx.wait();
            const event = receipt.events[0];

            expect(event.event).to.equal('SetThreshold');
            expect(event.args.newThreshold).to.equal(4);
        });

        it('updates the threshold correctly', async () => {
            await dlcManager.connect(deployer).setThreshold(4);
            const newThreshold = await dlcManager.getThreshold();
            expect(newThreshold).to.equal(4);
        });
    });

    describe('revoke APPROVED_SIGNER role', async () => {
        it('reverts if called by a non-admin', async () => {
            await expect(
                dlcManager
                    .connect(user)
                    .revokeRole(
                        ethers.utils.id('APPROVED_SIGNER'),
                        attestor1.address
                    )
            ).to.be.revertedWith(
                'AccessControl: account 0x90f79bf6eb2c4f870365e785982e1f101e93b906 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000'
            );
        });
        it('reverts if it would decrese below threshold', async () => {
            await setSigners(dlcManager, [attestor1, attestor2]);
            await expect(
                dlcManager
                    .connect(deployer)
                    .revokeRole(
                        ethers.utils.id('APPROVED_SIGNER'),
                        attestor1.address
                    )
            ).to.be.revertedWithCustomError(
                dlcManager,
                'ThresholdMinimumReached'
            );
        });
    });

    describe('tssCommitment', async () => {
        it('is settable', async () => {
            // we have an original identifier
            const secretIdentifier = crypto.randomBytes(32);
            // we hash it
            const hashedIdentifier = ethers.utils.keccak256(secretIdentifier);
            // we set the commitment
            await dlcManager
                .connect(deployer)
                .setTSSCommitment(hashedIdentifier);

            const commitment = await dlcManager.tssCommitment();
            expect(commitment).to.equal(hashedIdentifier);
        });
    });

    describe('setupVault', async () => {
        it('reverts if called by a non-whitelisted user', async () => {
            await expect(
                dlcManager.connect(user).setupVault()
            ).to.be.revertedWithCustomError(dlcManager, 'NotWhitelisted');
        });
        it('stores the _uuid in the userVaults map', async () => {
            await whitelistAddress(dlcManager, user);
            const tx = await dlcManager.connect(user).setupVault();
            const receipt = await tx.wait();
            const _uuid = receipt.events[0].args.uuid;
            expect(await dlcManager.userVaults(user.address, 0)).to.equal(
                _uuid
            );
        });

        it('emits a CreateDLC event with the correct data', async () => {
            await whitelistAddress(dlcManager, user);
            const tx = await dlcManager.connect(user).setupVault();

            const receipt = await tx.wait();
            const event = receipt.events[0];

            const decodedEvent = dlcManager.interface.parseLog(event);

            expect(decodedEvent.name).to.equal('CreateDLC');
            expect(decodedEvent.args.uuid).to.not.equal(undefined);
            expect(decodedEvent.args.creator).to.equal(user.address);
        });

        it('called multiple times generates unique UUIDs', async () => {
            await whitelistAddress(dlcManager, user);

            const tx = await dlcManager.connect(user).setupVault();
            const receipt = await tx.wait();
            const tx2 = await dlcManager.connect(user).setupVault();
            const receipt2 = await tx2.wait();

            const decodedEvent = dlcManager.interface.parseLog(
                receipt.events[0]
            );
            const decodedEvent2 = dlcManager.interface.parseLog(
                receipt2.events[0]
            );
            const uuid1 = decodedEvent.args.uuid;
            const uuid2 = decodedEvent2.args.uuid;
            expect(uuid1).to.not.equal(uuid2);
        });
    });

    describe('getDLC', async () => {
        let uuid;
        beforeEach(async () => {
            await whitelistAddress(dlcManager, user);

            const tx = await dlcManager.connect(user).setupVault();
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;
        });

        it('reverts if called with a non-existing UUID', async () => {
            const wrongUUID =
                '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
            await expect(
                dlcManager.getDLC(wrongUUID)
            ).to.be.revertedWithCustomError(dlcManager, 'DLCNotFound');
        });

        it('returns the correct data', async () => {
            await setSigners(dlcManager, attestors);
            const signatureBytesForPending = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-redeem-pending',
                    newLockedAmount: 0,
                },
                attestors,
                3
            );
            const signatureBytesForFunding = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );
            const tx2 = await dlcManager
                .connect(attestor1)
                .setStatusPending(uuid, btcTxId, signatureBytesForPending, 0);
            await tx2.wait();
            const tx3 = await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    uuid,
                    btcTxId,
                    signatureBytesForFunding,
                    mockTaprootPubkey,
                    valueLocked
                );
            await tx3.wait();

            const data = await dlcManager.getDLC(uuid);
            expect(data.creator).to.equal(user.address);
            expect(data.valueLocked).to.equal(valueLocked);
        });
    });

    describe('getDLCByIndex', async () => {
        let uuid;
        beforeEach(async () => {
            await whitelistAddress(dlcManager, user);

            const tx = await dlcManager.connect(user).setupVault();
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            await setSigners(dlcManager, attestors);
            const signatureBytesForPending = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-redeem-pending',
                    newLockedAmount: 0,
                },
                attestors,
                3
            );
            const signatureBytesForFunding = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );
            const tx2 = await dlcManager
                .connect(attestor1)
                .setStatusPending(uuid, btcTxId, signatureBytesForPending, 0);
            await tx2.wait();
            const tx3 = await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    uuid,
                    btcTxId,
                    signatureBytesForFunding,
                    mockTaprootPubkey,
                    valueLocked
                );
            await tx3.wait();
        });

        it('returns 0s if called with a non-existing index', async () => {
            let dlc = await dlcManager.getDLCByIndex(5);
            expect(dlc.creator).to.equal(ethers.constants.AddressZero);
            expect(dlc.valueLocked).to.equal(0);
            expect(dlc.uuid).to.equal(ethers.constants.HashZero);
        });

        it('returns the correct data', async () => {
            const data = await dlcManager.getDLCByIndex(0);
            expect(data.creator).to.equal(user.address);
            expect(data.valueLocked).to.equal(valueLocked);
        });
    });

    describe('setStatusFunded', async () => {
        let uuid;
        beforeEach(async () => {
            await whitelistAddress(dlcManager, user);

            const tx = await dlcManager.connect(user).setupVault();
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            await setSigners(dlcManager, attestors);
            const signatureBytesForPending = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-redeem-pending',
                    newLockedAmount: 0,
                },
                attestors,
                3
            );
            const tx2 = await dlcManager
                .connect(attestor1)
                .setStatusPending(uuid, btcTxId, signatureBytesForPending, 0);
            await tx2.wait();
        });

        it('reverts if called without enough signatures', async () => {
            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                1
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(
                        uuid,
                        btcTxId,
                        signatureBytes,
                        mockTaprootPubkey,
                        valueLocked
                    )
            ).to.be.revertedWithCustomError(dlcManager, 'NotEnoughSignatures');
        });

        it('reverts if contains non-approved signer', async () => {
            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                [...attestors, randomAccount],
                4
            );

            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(
                        uuid,
                        btcTxId,
                        signatureBytes,
                        mockTaprootPubkey,
                        valueLocked
                    )
            ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        });

        it('reverts if signature is for other function', async () => {
            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'post-close-dlc',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );

            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(
                        uuid,
                        btcTxId,
                        signatureBytes,
                        mockTaprootPubkey,
                        valueLocked
                    )
            ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        });

        it('reverts if DLC is not in the right state', async () => {
            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );

            const tx2 = await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    uuid,
                    btcTxId,
                    signatureBytes,
                    mockTaprootPubkey,
                    valueLocked
                );
            await tx2.wait();

            const sigs = await getSignatures(
                {
                    uuid,
                    btcTxId: btcTxId2,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );

            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(
                        uuid,
                        btcTxId2,
                        sigs,
                        mockTaprootPubkey,
                        valueLocked
                    )
            ).to.be.revertedWithCustomError(dlcManager, 'DLCNotPending');
        });

        it('reverts if attestors sign a different UUID', async () => {
            const wrongUUID =
                '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
            const signatureBytes = await getSignatures(
                {
                    uuid: wrongUUID,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(
                        uuid,
                        btcTxId,
                        signatureBytes,
                        mockTaprootPubkey,
                        valueLocked
                    )
            ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        });

        it('reverts if attestors sign a different btcTxId', async () => {
            const wrongBtcTxId =
                '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId: wrongBtcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(
                        uuid,
                        btcTxId,
                        signatureBytes,
                        mockTaprootPubkey,
                        valueLocked
                    )
            ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        });

        it('reverts if signatures are not unique', async () => {
            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                [attestor1, attestor1, attestor1],
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(
                        uuid,
                        btcTxId,
                        signatureBytes,
                        mockTaprootPubkey,
                        valueLocked
                    )
            ).to.be.revertedWithCustomError(dlcManager, 'DuplicateSignature');
        });

        it('reverts if deposit is too large', async () => {
            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked * 100,
                },
                [attestor1, attestor1, attestor1],
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(
                        uuid,
                        btcTxId,
                        signatureBytes,
                        mockTaprootPubkey,
                        valueLocked * 100
                    )
            ).to.be.revertedWithCustomError(dlcManager, 'DuplicateSignature');
        });

        it('reverts if deposit is too small', async () => {
            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: 100,
                },
                [attestor1, attestor1, attestor1],
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(
                        uuid,
                        btcTxId,
                        signatureBytes,
                        mockTaprootPubkey,
                        100
                    )
            ).to.be.revertedWithCustomError(dlcManager, 'DuplicateSignature');
        });

        it('mints dlcBTC tokens to the user', async () => {
            await whitelistAddress(dlcManager, user);
            const tx = await dlcManager.connect(user).setupVault();
            await tx.wait();

            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );
            const tx2 = await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    uuid,
                    btcTxId,
                    signatureBytes,
                    mockTaprootPubkey,
                    valueLocked
                );
            await tx2.wait();
            expect(await dlcBtc.balanceOf(user.address)).to.equal(valueLocked);
        });

        it('emits a StatusFunded event with the correct data', async () => {
            const signatureBytes = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    newLockedAmount: valueLocked,
                },
                attestors,
                3
            );
            const tx = await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    uuid,
                    btcTxId,
                    signatureBytes,
                    mockTaprootPubkey,
                    valueLocked
                );
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (e) => e.event === 'SetStatusFunded'
            );

            expect(event.event).to.equal('SetStatusFunded');
            expect(event.args.uuid).to.equal(uuid);
            expect(event.args.btcTxId).to.equal(btcTxId);
        });
    });
});
