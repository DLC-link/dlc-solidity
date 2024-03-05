const { expect } = require('chai');
const { ethers } = require('hardhat');
const hardhat = require('hardhat');

async function whitelistProtocolContractAndAddress(dlcManager, mockProtocol) {
    await dlcManager.grantRole(
        ethers.utils.id('WHITELISTED_CONTRACT'),
        mockProtocol.address
    );
}

async function getSignatures(message, attestors, numberOfSignatures) {
    const hashedOriginalMessage = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'string'],
            [message.uuid, message.btcTxId]
        )
    );
    let signatureBytes = [];
    for (let i = 0; i < numberOfSignatures; i++) {
        const sig = await attestors[i].signMessage(
            ethers.utils.arrayify(hashedOriginalMessage)
        );
        // console.log('Attestor address:', attestors[i].address);
        // console.log(
        //     'Recovered:',
        //     ethers.utils.verifyMessage(
        //         ethers.utils.arrayify(hashedOriginalMessage),
        //         sig
        //     )
        // );

        signatureBytes.push(ethers.utils.arrayify(sig));
    }
    // Convert signatures from strings to bytes
    return { prefixedMessageHash: hashedOriginalMessage, signatureBytes };
}

async function setSigners(dlcManager, attestors) {
    for (let i = 0; i < attestors.length; i++) {
        await dlcManager.addApprovedSigner(attestors[i].address);
    }
}

describe('DLCManager', () => {
    let dlcManager, mockProtocol;
    let accounts, deployer, protocol, user, randomAccount, anotherAccount;
    let attestor1, attestor2, attestor3;
    let attestors;

    const valueLocked = 100000000; // 1 BTC
    const btcTxId = '0x1234567890';

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

        // DLCManager
        const DLCManager = await ethers.getContractFactory('DLCManager');
        dlcManager = await hardhat.upgrades.deployProxy(DLCManager, [
            deployer.address,
            3,
        ]);
        await dlcManager.deployed();

        // MockProtocol
        const MockProtocol = await ethers.getContractFactory('MockProtocol');
        mockProtocol = await MockProtocol.connect(protocol).deploy(
            dlcManager.address
        );
        await mockProtocol.deployed();
    });

    describe('test contracts are deployed correctly', async () => {
        it('deploys DLCManager correctly', async () => {
            expect(dlcManager.address).to.not.equal(0);
        });
        it('deploys MockProtocol correctly', async () => {
            expect(mockProtocol.address).to.not.equal(0);
        });
    });

    describe('contract is pausable', async () => {
        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            await dlcManager.pauseContract();
        });
        it('reverts correctly when paused', async () => {
            await expect(
                mockProtocol.connect(user).requestCreateDLC(valueLocked)
            ).to.be.revertedWith('Pausable: paused');
        });
        it('allows functions when unpaused', async () => {
            await dlcManager.unpauseContract();
            await expect(
                mockProtocol.connect(user).requestCreateDLC(valueLocked)
            ).to.not.be.revertedWith('Pausable: paused');
        });
    });

    describe('createDLC', async () => {
        it('reverts if called from a non-whitelisted contract', async () => {
            await expect(
                mockProtocol.connect(user).requestCreateDLC(valueLocked)
            ).to.be.revertedWithCustomError(
                dlcManager,
                'ContractNotWhitelisted'
            );
        });

        it('emits a CreateDLC event with the correct data', async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);

            const receipt = await tx.wait();
            const event = receipt.events[0];

            const decodedEvent = dlcManager.interface.parseLog(event);

            expect(decodedEvent.name).to.equal('CreateDLC');
            expect(decodedEvent.args.uuid).to.not.equal(undefined);
            expect(decodedEvent.args.creator).to.equal(user.address);
        });

        it('called multiple times generates unique UUIDs', async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const tx2 = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
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

    describe('setStatusFunded', async () => {
        let uuid;
        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;
        });

        it('reverts if called without enough signatures', async () => {
            await setSigners(dlcManager, attestors);
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId },
                attestors,
                2
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(uuid, btcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'NotEnoughSignatures');
        });

        it('reverts if contains non-approved signer', async () => {
            await setSigners(dlcManager, attestors);
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId },
                [...attestors, randomAccount],
                4
            );

            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(uuid, btcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        });

        // NOTE: TODO: it actually reverts with duplicate signature this way
        xit('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            const newUuid = decodedEvent.args.uuid;

            await setSigners(dlcManager, attestors);

            const { prefixedMessage, signatureBytes } = await getSignatures(
                newUuid,
                attestors,
                3
            );

            const tx2 = await dlcManager.setStatusFunded(
                newUuid,
                btcTxId,
                prefixedMessage,
                signatureBytes
            );
            await tx2.wait();

            await expect(
                dlcManager.setStatusFunded(
                    newUuid,
                    btcTxId,
                    prefixedMessage,
                    signatureBytes
                )
            ).to.be.revertedWithCustomError(dlcManager, 'DLCNotReady');
        });

        it('reverts if attestors sign a different UUID', async () => {
            await setSigners(dlcManager, attestors);
            const wrongUUID =
                '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid: wrongUUID, btcTxId },
                attestors,
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(uuid, btcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        });

        it('reverts if attestors sign a different btcTxId', async () => {
            await setSigners(dlcManager, attestors);
            const wrongBtcTxId =
                '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId: wrongBtcTxId },
                attestors,
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(uuid, btcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        });

        it('reverts if signatures are not unique', async () => {
            await setSigners(dlcManager, attestors);
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId },
                [attestor1, attestor1, attestor1],
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusFunded(uuid, btcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'DuplicateSignature');
        });

        it('emits a StatusFunded event with the correct data', async () => {
            await setSigners(dlcManager, attestors);
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId },
                attestors,
                3
            );
            const tx = await dlcManager
                .connect(attestor1)
                .setStatusFunded(uuid, btcTxId, signatureBytes);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (e) => e.event === 'SetStatusFunded'
            );

            expect(event.event).to.equal('SetStatusFunded');
            expect(event.args.uuid).to.equal(uuid);
            expect(event.args.btcTxId).to.equal(btcTxId);
        });
    });

    describe('closeDLC', async () => {
        let uuid;
        let outcome = 10000;

        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            await setSigners(dlcManager, attestors);
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId },
                attestors,
                3
            );
            await dlcManager
                .connect(attestor1)
                .setStatusFunded(uuid, btcTxId, signatureBytes);
        });

        it('reverts if not called by the creator contract', async () => {
            await expect(
                dlcManager.connect(randomAccount).closeDLC(uuid)
            ).to.be.revertedWithCustomError(dlcManager, 'NotCreatorContract');
        });

        it('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            const newUuid = decodedEvent.args.uuid;

            await expect(
                mockProtocol.connect(protocol).requestCloseDLC(newUuid)
            ).to.be.revertedWithCustomError(dlcManager, 'DLCNotFunded');
        });

        it('emits a CloseDLC event with the correct data', async () => {
            const tx = await mockProtocol.connect(user).requestCloseDLC(uuid);
            const receipt = await tx.wait();
            const event = receipt.events[0];

            const decodedEvent = dlcManager.interface.parseLog(event);

            expect(decodedEvent.name).to.equal('CloseDLC');
            expect(decodedEvent.args.uuid).to.equal(uuid);
            expect(decodedEvent.args.sender).to.equal(mockProtocol.address);
        });
    });

    describe('postCloseDLC', async () => {
        let uuid;
        const closingBtcTxId = '0x1234567890123';

        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            await setSigners(dlcManager, attestors);
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId },
                attestors,
                3
            );
            const tx3 = await dlcManager
                .connect(attestor1)
                .setStatusFunded(uuid, btcTxId, signatureBytes);
            await tx3.wait();
            const tx4 = await mockProtocol
                .connect(protocol)
                .requestCloseDLC(uuid);
            await tx4.wait();
        });

        it('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            const newUuid = decodedEvent.args.uuid;

            await setSigners(dlcManager, attestors);
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid: newUuid, btcTxId: closingBtcTxId },
                attestors,
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .postCloseDLC(newUuid, closingBtcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'DLCNotClosing');
        });

        it('reverts if called without enough signatures', async () => {
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId: closingBtcTxId },
                attestors,
                2
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .postCloseDLC(uuid, closingBtcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'NotEnoughSignatures');
        });

        it('reverts if contains non-approved signer', async () => {
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId: closingBtcTxId },
                [...attestors, randomAccount],
                4
            );

            await expect(
                dlcManager
                    .connect(attestor1)
                    .postCloseDLC(uuid, closingBtcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        });

        it('reverts if attestors sign a different UUID', async () => {
            const wrongUUID =
                '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid: wrongUUID, btcTxId: closingBtcTxId },
                attestors,
                3
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .postCloseDLC(uuid, closingBtcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        });

        it('emits a PostCloseDLC event with the correct data', async () => {
            await setSigners(dlcManager, attestors);
            const { prefixedMessageHash, signatureBytes } = await getSignatures(
                { uuid, btcTxId: closingBtcTxId },
                attestors,
                3
            );
            const tx = await dlcManager
                .connect(attestor1)
                .postCloseDLC(uuid, closingBtcTxId, signatureBytes);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (e) => e.event === 'PostCloseDLC'
            );

            expect(event.event).to.equal('PostCloseDLC');
            expect(event.args.uuid).to.equal(uuid);
            expect(event.args.btcTxId).to.equal(closingBtcTxId);
        });
    });
});
