const { expect } = require('chai');
const { ethers } = require('hardhat');
const web3 = require('web3');

async function whitelistProtocolContractAndAddress(
    dlcManager,
    mockProtocol,
    protocolWallet
) {
    await dlcManager.grantRole(
        web3.utils.soliditySha3('WHITELISTED_CONTRACT'),
        mockProtocol.address
    );
    await dlcManager.grantRole(
        web3.utils.soliditySha3('WHITELISTED_WALLET'),
        protocolWallet.address
    );
}

describe('DLCManagerV1', () => {
    let dlcManager, mockAttestorManager, mockProtocol;
    let accounts, deployer, protocol, protocolWallet, user;

    const attestorCount = 3;
    const attestorList = [
        'localhost',
        'dlc.link/oracle',
        'someAttestorDomain.com',
    ];

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        protocol = accounts[1];
        protocolWallet = accounts[2];
        user = accounts[3];
        randomAccount = accounts[4];
        anotherAccount = accounts[5];

        // AttestorManager
        const MockAttestorManager = await ethers.getContractFactory(
            'MockAttestorManager'
        );
        mockAttestorManager = await MockAttestorManager.deploy();
        await mockAttestorManager.deployed();

        // DLCManager
        const DLCManager = await ethers.getContractFactory('DLCManagerV1');
        dlcManager = await DLCManager.deploy(
            deployer.address,
            mockAttestorManager.address
        );
        await dlcManager.deployed();

        // MockProtocol
        const MockProtocol = await ethers.getContractFactory('MockProtocol');
        mockProtocol = await MockProtocol.connect(protocol).deploy(
            dlcManager.address,
            protocolWallet.address
        );
        await mockProtocol.deployed();
    });

    describe('test contracts are deployed correctly', async () => {
        it('deploys AttestorManager correctly', async () => {
            expect(mockAttestorManager.address).to.not.equal(0);
        });
        it('deploys DLCManager correctly', async () => {
            expect(dlcManager.address).to.not.equal(0);
        });
        it('deploys MockProtocol correctly', async () => {
            expect(mockProtocol.address).to.not.equal(0);
        });
    });

    describe('contract is pausable', async () => {
        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(
                dlcManager,
                mockProtocol,
                protocolWallet
            );

            await dlcManager.pauseContract();
        });
        it('reverts correctly when paused', async () => {
            await expect(
                mockProtocol.connect(user).requestCreateDLC(attestorCount)
            ).to.be.revertedWith('Pausable: paused');
        });
        it('allows functions when unpaused', async () => {
            await dlcManager.unpauseContract();
            await expect(
                mockProtocol.connect(user).requestCreateDLC(attestorCount)
            ).to.not.be.revertedWith('Pausable: paused');
        });
    });

    describe('createDLC', async () => {
        it('reverts if called from a non-whitelisted contract', async () => {
            await expect(
                mockProtocol.connect(user).requestCreateDLC(attestorCount)
            ).to.be.revertedWith(
                'Only whitelisted contracts can call this function'
            );
        });

        it('reverts if called with a non-whitelisted protocolWallet address', async () => {
            await dlcManager.grantRole(
                web3.utils.soliditySha3('WHITELISTED_CONTRACT'),
                mockProtocol.address
            );
            await expect(
                mockProtocol.connect(user).requestCreateDLC(attestorCount)
            ).to.be.revertedWith('Unathorized Wallet Address');
        });

        it('emits a CreateDLC event with the correct data', async () => {
            await whitelistProtocolContractAndAddress(
                dlcManager,
                mockProtocol,
                protocolWallet
            );

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);

            const receipt = await tx.wait();
            const event = receipt.events[0];

            const decodedEvent = dlcManager.interface.parseLog(event);

            expect(decodedEvent.name).to.equal('CreateDLC');
            expect(decodedEvent.args.uuid).to.not.equal(undefined);
            expect(decodedEvent.args.attestorList).to.deep.equal(attestorList);
            expect(decodedEvent.args.creator).to.equal(mockProtocol.address);
            expect(decodedEvent.args.protocolWallet).to.equal(
                protocolWallet.address
            );
            expect(decodedEvent.args.eventSource).to.equal(
                'dlclink:create-dlc:v1'
            );
        });

        it('called multiple times generates unique UUIDs', async () => {
            await whitelistProtocolContractAndAddress(
                dlcManager,
                mockProtocol,
                protocolWallet
            );

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);
            const receipt = await tx.wait();
            const tx2 = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);
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

    xdescribe('postCreateDLC', async () => {
        let uuid;
        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(
                dlcManager,
                mockProtocol,
                protocolWallet
            );

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;
        });

        it('reverts if called from a non-whitelisted wallet', async () => {
            await expect(
                dlcManager.connect(randomAccount).postCreateDLC(uuid)
            ).to.be.revertedWith(
                'Only whitelisted wallets can call this function'
            );
        });

        it('reverts if not called from the associated wallet', async () => {
            await dlcManager.grantRole(
                web3.utils.soliditySha3('WHITELISTED_WALLET'),
                randomAccount.address
            );

            await expect(
                dlcManager.connect(randomAccount).postCreateDLC(uuid)
            ).to.be.revertedWith('Unathorized');
        });

        it('emits a PostCreateDLC event with the correct data', async () => {
            const tx = await dlcManager
                .connect(protocolWallet)
                .postCreateDLC(uuid);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (e) => e.event === 'PostCreateDLC'
            );

            expect(event.event).to.equal('PostCreateDLC');
            expect(event.args.uuid).to.equal(uuid);
            expect(event.args.creator).to.equal(mockProtocol.address);
            expect(event.args.protocolWallet).to.equal(protocolWallet.address);

            // Sender should be the protocol wallet on success
            expect(event.args.sender).to.equal(protocolWallet.address);
            expect(event.args.eventSource).to.equal(
                'dlclink:post-create-dlc:v1'
            );
        });
    });

    describe('setStatusFunded', async () => {
        let uuid;
        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(
                dlcManager,
                mockProtocol,
                protocolWallet
            );

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;
        });

        it('reverts if called from a non-whitelisted wallet', async () => {
            await expect(
                dlcManager.connect(randomAccount).setStatusFunded(uuid)
            ).to.be.revertedWith(
                'Only whitelisted wallets can call this function'
            );
        });

        it('reverts if not called from the associated wallet', async () => {
            await dlcManager.grantRole(
                web3.utils.soliditySha3('WHITELISTED_WALLET'),
                randomAccount.address
            );

            await expect(
                dlcManager.connect(randomAccount).setStatusFunded(uuid)
            ).to.be.revertedWith('Unathorized');
        });

        xit('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            const newUuid = decodedEvent.args.uuid;

            await expect(
                dlcManager.connect(protocolWallet).setStatusFunded(newUuid)
            ).to.be.revertedWith('Invalid Status Transition');
        });

        it('emits a StatusFunded event with the correct data', async () => {
            const tx = await dlcManager
                .connect(protocolWallet)
                .setStatusFunded(uuid);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (e) => e.event === 'SetStatusFunded'
            );

            expect(event.event).to.equal('SetStatusFunded');
            expect(event.args.uuid).to.equal(uuid);
            expect(event.args.creator).to.equal(mockProtocol.address);
            expect(event.args.protocolWallet).to.equal(protocolWallet.address);
            expect(event.args.sender).to.equal(protocolWallet.address);
            expect(event.args.eventSource).to.equal(
                'dlclink:set-status-funded:v1'
            );
        });
    });

    describe('closeDLC', async () => {
        let uuid;
        let outcome = 10000;

        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(
                dlcManager,
                mockProtocol,
                protocolWallet
            );

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            await dlcManager.connect(protocolWallet).setStatusFunded(uuid);
        });

        it('reverts if called from a contract that isnt he owner/creator', async () => {
            await expect(
                dlcManager.connect(randomAccount).closeDLC(uuid, outcome)
            ).to.be.revertedWith(
                'Only the DLC owner can call this function'
            );
        });

        it('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            const newUuid = decodedEvent.args.uuid;

            await expect(
                mockProtocol.connect(protocol).requestCloseDLC(newUuid, outcome)
            ).to.be.revertedWith('Invalid Status Transition');
        });

        it('emits a CloseDLC event with the correct data', async () => {
            const tx = await mockProtocol
                .connect(protocol)
                .requestCloseDLC(uuid, outcome);
            const receipt = await tx.wait();
            const event = receipt.events[0];

            const decodedEvent = dlcManager.interface.parseLog(event);

            expect(decodedEvent.name).to.equal('CloseDLC');
            expect(decodedEvent.args.uuid).to.equal(uuid);
            expect(decodedEvent.args.outcome).to.equal(outcome);
            expect(decodedEvent.args.creator).to.equal(mockProtocol.address);
            expect(decodedEvent.args.protocolWallet).to.equal(
                protocolWallet.address
            );
            expect(decodedEvent.args.sender).to.equal(mockProtocol.address);
            expect(decodedEvent.args.eventSource).to.equal(
                'dlclink:close-dlc:v1'
            );
        });
    });

    describe('postCloseDLC', async () => {
        let uuid;
        let outcome = 10000;

        beforeEach(async () => {
            await whitelistProtocolContractAndAddress(
                dlcManager,
                mockProtocol,
                protocolWallet
            );

            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            uuid = decodedEvent.args.uuid;

            const tx3 = await dlcManager
                .connect(protocolWallet)
                .setStatusFunded(uuid);
            await tx3.wait();
            const tx4 = await mockProtocol
                .connect(protocol)
                .requestCloseDLC(uuid, outcome);
            await tx4.wait();
        });

        it('reverts if called from a non-whitelisted wallet', async () => {
            await expect(
                dlcManager.connect(randomAccount).postCloseDLC(uuid, outcome)
            ).to.be.revertedWith(
                'Only whitelisted wallets can call this function'
            );
        });

        it('reverts if not called from the associated wallet', async () => {
            await dlcManager.grantRole(
                web3.utils.soliditySha3('WHITELISTED_WALLET'),
                randomAccount.address
            );

            await expect(
                dlcManager.connect(randomAccount).postCloseDLC(uuid, outcome)
            ).to.be.revertedWith('Unathorized');
        });

        it('reverts if DLC is not in the right state', async () => {
            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events[0];
            const decodedEvent = dlcManager.interface.parseLog(event);
            const newUuid = decodedEvent.args.uuid;

            await expect(
                dlcManager
                    .connect(protocolWallet)
                    .postCloseDLC(newUuid, outcome)
            ).to.be.revertedWith('Invalid Status Transition');
        });

        it('emits a PostCloseDLC event with the correct data', async () => {
            const tx = await dlcManager
                .connect(protocolWallet)
                .postCloseDLC(uuid, outcome);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (e) => e.event === 'PostCloseDLC'
            );

            expect(event.event).to.equal('PostCloseDLC');
            expect(event.args.uuid).to.equal(uuid);
            expect(event.args.outcome).to.equal(outcome);
            expect(event.args.creator).to.equal(mockProtocol.address);
            expect(event.args.protocolWallet).to.equal(protocolWallet.address);
            expect(event.args.sender).to.equal(protocolWallet.address);
        });
    });
});
