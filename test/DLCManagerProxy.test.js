const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');
const hardhat = require('hardhat');

function getRoleInBytes(role) {
    return ethers.utils.id(role);
}

async function whitelistProtocolContractAndAddress(dlcManager, mockProtocol) {
    await dlcManager.grantRole(
        ethers.utils.id('WHITELISTED_CONTRACT'),
        mockProtocol.address
    );
}

const mockUUID =
    '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967';

xdescribe('DLCManager Proxy', function () {
    let dlcManager, mockProtocol;
    let tokenManager, dlcBtc;
    let accounts, deployer, protocol, user, randomAccount, anotherAccount;
    let attestor1, attestor2, attestor3;
    let attestors;
    let dlcManagerV2;
    let UUID;

    const valueLocked = 100000000; // 1 BTC
    const btcTxId = '0x1234567890';
    const btcTxId2 = '0x1234567891';
    const btcFeeRecipient = '0x000001';

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

        await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);
    });

    it('should deploy', async () => {
        expect(dlcManager.address).to.not.equal(0);
    });

    describe('Upgrade through proxy', async () => {
        beforeEach(async () => {
            const tx = await mockProtocol
                .connect(user)
                .requestCreateDLC(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events[0];

            const decodedEvent = dlcManager.interface.parseLog(event);
            UUID = decodedEvent.args.uuid;

            // console.log('DLC before upgrade:', await dlcManager.getDLC(UUID));

            await dlcManager.connect(deployer).setThreshold(5);
            await dlcManager
                .connect(deployer)
                .setAttestorGroupPubKey('someKey');

            // test that the newTestFunction does not exist yet
            expect(() => dlcManager.newTestFunction()).to.throw(
                TypeError,
                'dlcManager.newTestFunction is not a function'
            );

            const DLCManagerV2Test = await ethers.getContractFactory(
                'DLCManagerV2Test',
                deployer
            );
            dlcManagerV2 = await hardhat.upgrades.upgradeProxy(
                dlcManager.address,
                DLCManagerV2Test
            );
        });
        it('should upgrade', async () => {
            expect(dlcManagerV2.address).to.not.equal(0);
        });
        it('should have the same threshold', async () => {
            expect(
                await dlcManagerV2.connect(deployer).getThreshold()
            ).to.equal(5);
        });
        it('should have the new test function', async () => {
            expect(await dlcManagerV2.newTestFunction()).to.equal(1);
        });
        it('should have the new test string', async () => {
            await dlcManagerV2.setTestString('test');
            expect(await dlcManagerV2.testString()).to.equal('test');
        });
        it('should still have the created DLC', async () => {
            const dlc = await dlcManagerV2.getDLC(UUID);
            // console.log(dlc);
            expect(dlc.valueLocked).to.equal(valueLocked);
            expect(dlc.creator).to.equal(user.address);
            expect(dlc.status).to.equal(0);
        });
        it('should have the new field on the dlc', async () => {
            const dlc = await dlcManagerV2.getDLC(UUID);
            expect(dlc.someNewField).to.equal(ethers.constants.AddressZero);
        });
        it('should have all the same fields', async () => {
            expect(await dlcManager.DLC_ADMIN_ROLE()).to.equal(
                await dlcManagerV2.DLC_ADMIN_ROLE()
            );
            expect(
                await dlcManagerV2.hasRole(
                    ethers.utils.id('DLC_ADMIN_ROLE'),
                    deployer.address
                )
            ).to.equal(true);
            expect(
                await dlcManagerV2.hasRole(
                    ethers.utils.id('WHITELISTED_CONTRACT'),
                    mockProtocol.address
                )
            ).to.equal(true);
            expect(await dlcManagerV2.attestorGroupPubKey()).to.equal(
                'someKey'
            );
        });
    });

    describe('Upgrade through proxy with TokenManager and dlcBTC', async () => {
        beforeEach(async () => {
            const DLCBTC = await ethers.getContractFactory('DLCBTC', deployer);
            dlcBtc = await upgrades.deployProxy(DLCBTC);
            await dlcBtc.deployed();

            const TokenManager = await ethers.getContractFactory(
                'TokenManager',
                deployer
            );
            // we deploy the TokenManager contract with the DLCManager address
            tokenManager = await upgrades.deployProxy(TokenManager, [
                deployer.address,
                deployer.address,
                dlcManager.address,
                dlcBtc.address,
                btcFeeRecipient,
            ]);

            await dlcBtc.transferOwnership(tokenManager.address);
            await tokenManager.connect(deployer).whitelistAddress(user.address);

            await whitelistProtocolContractAndAddress(dlcManager, tokenManager);
        });
        it('should work as expected before upgrade', async () => {
            expect(tokenManager.address).to.not.equal(0);
            expect(await dlcBtc.owner()).to.equal(tokenManager.address);
            const tx = await tokenManager.connect(user).setupVault(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (ev) => ev.event === 'SetupVault'
            );
            UUID = event.args.dlcUUID;
            const vault = await tokenManager.getVault(UUID);
            const DLC = await dlcManager.getDLC(UUID);
            expect(DLC.creator).to.equal(vault.creator);
            expect(vault.protocolContract).to.equal(tokenManager.address);
        });
        it('should work as expected after upgrades', async () => {
            // Creating a new DLC
            const tx = await tokenManager.connect(user).setupVault(valueLocked);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (ev) => ev.event === 'SetupVault'
            );
            UUID = event.args.dlcUUID;

            // Upgrade contract
            const DLCManagerV2Test = await ethers.getContractFactory(
                'DLCManagerV2Test',
                deployer
            );
            dlcManagerV2 = await hardhat.upgrades.upgradeProxy(
                dlcManager.address,
                DLCManagerV2Test
            );

            // lets see if fetching data works
            const vault = await tokenManager.getVault(UUID);
            const DLC = await dlcManagerV2.getDLC(UUID);
            expect(DLC.creator).to.equal(vault.creator);
            expect(vault.protocolContract).to.equal(tokenManager.address);

            const tx2 = await tokenManager
                .connect(user)
                .setupVault(valueLocked);
            const receipt2 = await tx.wait();
            const event2 = receipt.events.find(
                (ev) => ev.event === 'SetupVault'
            );
            const uuid2 = event2.args.dlcUUID;
            const vault2 = await tokenManager.getVault(uuid2);
            // console.log(vault2);
            const DLC2 = await dlcManagerV2.getDLC(uuid2);
            // console.log(DLC2);
            expect(DLC2.creator).to.equal(vault2.creator);
        });
    });
});
