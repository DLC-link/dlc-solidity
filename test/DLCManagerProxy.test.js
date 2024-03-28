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

describe('DLCManager Proxy', function () {
    let dlcManager, mockProtocol;
    let accounts, deployer, protocol, user, randomAccount, anotherAccount;
    let attestor1, attestor2, attestor3;
    let attestors;
    let dlcManagerV2;
    let UUID;

    const valueLocked = 100000000; // 1 BTC
    const btcTxId = '0x1234567890';
    const btcTxId2 = '0x1234567891';

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

        await whitelistProtocolContractAndAddress(dlcManager, mockProtocol);

        const tx = await mockProtocol
            .connect(user)
            .requestCreateDLC(valueLocked);
        const receipt = await tx.wait();
        const event = receipt.events[0];

        const decodedEvent = dlcManager.interface.parseLog(event);
        UUID = decodedEvent.args.uuid;
        console.log('UUID:', UUID);
    });

    it('should deploy', async () => {
        expect(dlcManager.address).to.not.equal(0);
    });

    describe('Upgrade through proxy', async () => {
        beforeEach(async () => {
            await dlcManager.connect(deployer).setThreshold(5);

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
            console.log(dlc);
            expect(dlc.valueLocked).to.equal(valueLocked);
        });
    });
});
