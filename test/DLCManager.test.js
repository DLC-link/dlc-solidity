const { expect } = require('chai');
const { ethers } = require('hardhat');
const hardhat = require('hardhat');
const crypto = require('crypto');

async function whitelistProtocolContractAndAddress(dlcManager, mockProtocol) {
    await dlcManager.grantRole(
        ethers.utils.id('WHITELISTED_CONTRACT'),
        mockProtocol.address
    );
}

async function getSignatures(message, attestors, numberOfSignatures) {
    const hashedOriginalMessage = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'string', 'string', 'uint256'],
            [
                message.uuid,
                message.btcTxId,
                message.functionString,
                message.valueLocked,
            ]
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
    return { signatureBytes };
}

async function setSigners(dlcManager, attestors) {
    for (let i = 0; i < attestors.length; i++) {
        await dlcManager.grantRole(
            ethers.utils.id('APPROVED_SIGNER'),
            attestors[i].address
        );
    }
}

describe('DLCManager', () => {
    let dlcManager, mockProtocol;
    let accounts, deployer, protocol, user, randomAccount, anotherAccount;
    let attestor1, attestor2, attestor3;
    let attestors;

    const valueLocked = 100000000; // 1 BTC
    const btcTxId = '0x1234567890';
    const btcTxId2 = '0x1234567891';
    const mockTaprootPubkey =
        '0x1234567890123456789012345678901234567890123456789012345678901234';

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
                mockProtocol.connect(user).requestCreateDLC()
            ).to.be.revertedWith('Pausable: paused');
        });
        it('allows functions when unpaused', async () => {
            await dlcManager.unpauseContract();
            await expect(
                mockProtocol.connect(user).requestCreateDLC()
            ).to.not.be.revertedWith('Pausable: paused');
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

    describe('createDLC', async () => {
        it('reverts if called from a non-whitelisted contract', async () => {
            await expect(
                mockProtocol.connect(user).requestCreateDLC()
            ).to.be.revertedWithCustomError(
                dlcManager,
                'ContractNotWhitelisted'
            );
        });

        it('emits a CreateDLC event with the correct data', async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol.connect(user).requestCreateDLC();

            const receipt = await tx.wait();
            const event = receipt.events[0];

            const decodedEvent = dlcManager.interface.parseLog(event);

            expect(decodedEvent.name).to.equal('CreateDLC');
            expect(decodedEvent.args.uuid).to.not.equal(undefined);
            expect(decodedEvent.args.creator).to.equal(user.address);
        });

        it('called multiple times generates unique UUIDs', async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol.connect(user).requestCreateDLC();
            const receipt = await tx.wait();
            const tx2 = await mockProtocol.connect(user).requestCreateDLC();
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
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol.connect(user).requestCreateDLC();
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
            const data = await dlcManager.getDLC(uuid);
            expect(data.creator).to.equal(user.address);
            expect(data.valueLocked).to.equal(0);
            expect(data.valueMinted).to.equal(0);

            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
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

            let dataAfterSSF = await dlcManager.getDLC(uuid);
            expect(dataAfterSSF.creator).to.equal(user.address);
            expect(dataAfterSSF.valueLocked).to.equal(valueLocked);
            expect(dataAfterSSF.valueMinted).to.equal(valueLocked);
        });
    });

    describe('getDLCByIndex', async () => {
        let uuid;
        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol.connect(user).requestCreateDLC();
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;
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
            expect(data.valueLocked).to.equal(0);
            expect(data.valueMinted).to.equal(0);

            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
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

            let dataAfterSSF = await dlcManager.getDLC(uuid);
            expect(dataAfterSSF.creator).to.equal(user.address);
            expect(dataAfterSSF.valueLocked).to.equal(valueLocked);
            expect(dataAfterSSF.valueMinted).to.equal(valueLocked);
        });
    });

    describe('setStatusFunded', async () => {
        let uuid;
        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol.connect(user).requestCreateDLC();
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;
        });

        it('reverts if called without enough signatures', async () => {
            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
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
            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
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
            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'post-close-dlc',
                    valueLocked: 0,
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

        xit('reverts if DLC is not in the right state', async () => {
            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
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

            await mockProtocol.connect(user).requestCloseDLC(uuid);

            const sigs = await getSignatures(
                {
                    uuid,
                    btcTxId: btcTxId2,
                    functionString: 'set-status-funded',
                    valueLocked,
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
                        sigs.signatureBytes,
                        mockTaprootPubkey,
                        valueLocked
                    )
            ).to.be.revertedWithCustomError(
                dlcManager,
                'DLCNotReadyOrRedeemPending'
            );
        });

        it('reverts if attestors sign a different UUID', async () => {
            await setSigners(dlcManager, attestors);
            const wrongUUID =
                '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
            const { signatureBytes } = await getSignatures(
                {
                    uuid: wrongUUID,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
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
            await setSigners(dlcManager, attestors);
            const wrongBtcTxId =
                '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId: wrongBtcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
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
            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
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

        it('emits a StatusFunded event with the correct data', async () => {
            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
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

    describe('setStatusRedeemPending', async () => {
        let uuid;
        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol.connect(user).requestCreateDLC();
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
                },
                attestors,
                3
            );
            const ssf_tx = await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    uuid,
                    btcTxId,
                    signatureBytes,
                    mockTaprootPubkey,
                    valueLocked
                );
            ssf_tx.wait();
        });

        // it('reverts if called without enough signatures', async () => {
        //     await setSigners(dlcManager, attestors);
        //     const { signatureBytes } = await getSignatures(
        //         {
        //             uuid,
        //             btcTxId,
        //             functionString: 'set-status-funded',
        //             valueLocked,
        //         },
        //         attestors,
        //         3
        //     );
        //     await expect(
        //         dlcManager
        //             .connect(attestor1)
        //             .setStatusFunded(
        //                 uuid,
        //                 btcTxId,
        //                 signatureBytes,
        //                 mockTaprootPubkey,
        //                 valueLocked
        //             )
        //     ).to.be.revertedWithCustomError(dlcManager, 'NotEnoughSignatures');
        // });

        // it('reverts if contains non-approved signer', async () => {
        //     await setSigners(dlcManager, attestors);
        //     const { signatureBytes } = await getSignatures(
        //         {
        //             uuid,
        //             btcTxId,
        //             functionString: 'set-status-funded',
        //             valueLocked,
        //         },
        //         [...attestors, randomAccount],
        //         4
        //     );

        //     await expect(
        //         dlcManager
        //             .connect(attestor1)
        //             .setStatusFunded(
        //                 uuid,
        //                 btcTxId,
        //                 signatureBytes,
        //                 mockTaprootPubkey,
        //                 valueLocked
        //             )
        //     ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        // });

        // it('reverts if signature is for other function', async () => {
        //     await setSigners(dlcManager, attestors);
        //     const { signatureBytes } = await getSignatures(
        //         {
        //             uuid,
        //             btcTxId,
        //             functionString: 'post-close-dlc',
        //             valueLocked: 0,
        //         },
        //         attestors,
        //         3
        //     );

        //     await expect(
        //         dlcManager
        //             .connect(attestor1)
        //             .setStatusFunded(
        //                 uuid,
        //                 btcTxId,
        //                 signatureBytes,
        //                 mockTaprootPubkey,
        //                 valueLocked
        //             )
        //     ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        // });

        xit('reverts if DLC is not in the right state', async () => {
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId: btcTxId2,
                    functionString: 'set-status-redeem-pending',
                    valueLocked: 0,
                },
                attestors,
                3
            );

            const tx = await dlcManager
                .connect(attestor1)
                .setStatusRedeemPending(uuid, btcTxId2, signatureBytes, 0);

            await tx.wait();

            await expect(
                dlcManager
                    .connect(attestor1)
                    .setStatusRedeemPending(uuid, btcTxId2, signatureBytes, 0)
            ).to.be.revertedWithCustomError(dlcManager, 'DLCNotFunded');
        });

        // it('reverts if attestors sign a different UUID', async () => {
        //     await setSigners(dlcManager, attestors);
        //     const wrongUUID =
        //         '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
        //     const { signatureBytes } = await getSignatures(
        //         {
        //             uuid: wrongUUID,
        //             btcTxId,
        //             functionString: 'set-status-funded',
        //             valueLocked,
        //         },
        //         attestors,
        //         3
        //     );
        //     await expect(
        //         dlcManager
        //             .connect(attestor1)
        //             .setStatusFunded(
        //                 uuid,
        //                 btcTxId,
        //                 signatureBytes,
        //                 mockTaprootPubkey,
        //                 valueLocked
        //             )
        //     ).to.be.revertedWithCustomError(dlcManager, 'InvalidSigner');
        // });

        xit('emits a StatusRedeemPending event with the correct data', async () => {
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId: btcTxId2,
                    functionString: 'set-status-redeem-pending',
                    valueLocked: 0,
                },
                attestors,
                3
            );

            const tx = await dlcManager
                .connect(attestor1)
                .setStatusRedeemPending(uuid, btcTxId2, signatureBytes, 0);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (e) => e.event === 'SetStatusRedeemPending'
            );

            expect(event.event).to.equal('SetStatusRedeemPending');
            expect(event.args.uuid).to.equal(uuid);
            expect(event.args.btcTxId).to.equal(btcTxId2);
        });
    });

    describe('closeDLC', async () => {
        let uuid;
        let outcome = 10000;

        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol.connect(user).requestCreateDLC();
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
                },
                attestors,
                3
            );
            await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    uuid,
                    btcTxId,
                    signatureBytes,
                    mockTaprootPubkey,
                    valueLocked
                );
        });

        it('reverts if not called by the creator contract', async () => {
            await expect(
                dlcManager.connect(randomAccount).closeDLC(uuid)
            ).to.be.revertedWithCustomError(dlcManager, 'NotCreatorContract');
        });

        xit('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol.connect(user).requestCreateDLC();
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

            const tx = await mockProtocol.connect(user).requestCreateDLC();
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            await setSigners(dlcManager, attestors);
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId,
                    functionString: 'set-status-funded',
                    valueLocked,
                },
                attestors,
                3
            );
            const tx3 = await dlcManager
                .connect(attestor1)
                .setStatusFunded(
                    uuid,
                    btcTxId,
                    signatureBytes,
                    mockTaprootPubkey,
                    valueLocked
                );
            await tx3.wait();
            const tx4 = await mockProtocol
                .connect(protocol)
                .requestCloseDLC(uuid);
            await tx4.wait();
        });

        xit('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol.connect(user).requestCreateDLC();
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            const newUuid = decodedEvent.args.uuid;

            const { signatureBytes } = await getSignatures(
                {
                    uuid: newUuid,
                    btcTxId: closingBtcTxId,
                    functionString: 'post-close-dlc',
                    valueLocked: 0,
                },
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
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId: closingBtcTxId,
                    functionString: 'post-close-dlc',
                    valueLocked: 0,
                },
                attestors,
                1
            );
            await expect(
                dlcManager
                    .connect(attestor1)
                    .postCloseDLC(uuid, closingBtcTxId, signatureBytes)
            ).to.be.revertedWithCustomError(dlcManager, 'NotEnoughSignatures');
        });

        it('reverts if contains non-approved signer', async () => {
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId: closingBtcTxId,
                    functionString: 'post-close-dlc',
                    valueLocked: 0,
                },
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
            const { signatureBytes } = await getSignatures(
                {
                    uuid: wrongUUID,
                    btcTxId: closingBtcTxId,
                    functionString: 'post-close-dlc',
                    valueLocked: 0,
                },
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
            const { signatureBytes } = await getSignatures(
                {
                    uuid,
                    btcTxId: closingBtcTxId,
                    functionString: 'post-close-dlc',
                    valueLocked: 0,
                },
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
