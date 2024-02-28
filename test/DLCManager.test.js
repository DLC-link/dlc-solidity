const { expect } = require('chai');
const { ethers } = require('hardhat');
const hardhat = require('hardhat');

async function whitelistProtocolContractAndAddress(dlcManager, mockProtocol) {
    await dlcManager.grantRole(
        ethers.utils.id('WHITELISTED_CONTRACT'),
        mockProtocol.address
    );
}

describe('DLCManager', () => {
    let dlcManager, mockProtocol;
    let accounts, deployer, protocol, user;

    const valueLocked = 100000000; // 1 BTC
    const btcTxId = '0x1234567890';

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        protocol = accounts[1];
        user = accounts[3];
        randomAccount = accounts[4];
        anotherAccount = accounts[5];

        // DLCManager
        const DLCManager = await ethers.getContractFactory('DLCManager');
        dlcManager = await hardhat.upgrades.deployProxy(DLCManager, [
            deployer.address,
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

        // it('reverts if called from a non-whitelisted wallet', async () => {
        //     await expect(
        //         dlcManager.connect(randomAccount).setStatusFunded(uuid, btcTxId)
        //     ).to.be.revertedWithCustomError(dlcManager, 'WalletNotWhitelisted');
        // });

        // it('reverts if not called from the associated wallet', async () => {
        //     await dlcManager.grantRole(
        //         ethers.utils.id('WHITELISTED_WALLET'),
        //         randomAccount.address
        //     );

        //     await expect(
        //         dlcManager.connect(randomAccount).setStatusFunded(uuid, btcTxId)
        //     ).to.be.revertedWithCustomError(dlcManager, 'UnathorizedWallet');
        // });

        it('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            const newUuid = decodedEvent.args.uuid;

            const tx2 = await dlcManager.setStatusFunded(newUuid, btcTxId);
            await tx2.wait();

            await expect(
                dlcManager.setStatusFunded(newUuid, btcTxId)
            ).to.be.revertedWithCustomError(dlcManager, 'DLCNotReady');
        });

        it('emits a StatusFunded event with the correct data', async () => {
            const tx = await dlcManager.setStatusFunded(uuid, btcTxId);
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

            await dlcManager.setStatusFunded(uuid, btcTxId);
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

        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            const tx3 = await dlcManager.setStatusFunded(uuid, btcTxId);
            await tx3.wait();
            const tx4 = await mockProtocol
                .connect(protocol)
                .requestCloseDLC(uuid);
            await tx4.wait();
        });

        // it('reverts if called from a non-whitelisted wallet', async () => {
        //     await expect(
        //         dlcManager.connect(randomAccount).postCloseDLC(uuid, btcTxId)
        //     ).to.be.revertedWithCustomError(dlcManager, 'WalletNotWhitelisted');
        // });

        // it('reverts if not called from the associated wallet', async () => {
        //     await dlcManager.grantRole(
        //         ethers.utils.id('WHITELISTED_WALLET'),
        //         randomAccount.address
        //     );

        //     await expect(
        //         dlcManager.connect(randomAccount).postCloseDLC(uuid, btcTxId)
        //     ).to.be.revertedWithCustomError(dlcManager, 'UnathorizedWallet');
        // });

        it('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            const newUuid = decodedEvent.args.uuid;

            await expect(
                dlcManager.postCloseDLC(newUuid, btcTxId)
            ).to.be.revertedWithCustomError(dlcManager, 'DLCNotClosing');
        });

        it('emits a PostCloseDLC event with the correct data', async () => {
            const tx = await dlcManager.postCloseDLC(uuid, btcTxId);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (e) => e.event === 'PostCloseDLC'
            );

            expect(event.event).to.equal('PostCloseDLC');
            expect(event.args.uuid).to.equal(uuid);
            expect(event.args.btcTxId).to.equal(btcTxId);
        });
    });
});
