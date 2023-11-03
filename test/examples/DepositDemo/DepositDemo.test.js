const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');
const web3 = require('web3');

const Status = {
    None: 0,
    Ready: 1,
    Funded: 2,
    PreClosed: 3,
    Closed: 4,
};

describe('DepositDemo', function () {
    let mockAttestorManager;
    let dlcManager;
    let dlcBtc;
    let depositDemo;
    let emergencyRefundTime;
    let deployer, protocol, user, someRandomAccount;

    let mockUUID =
        '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967';
    let btcDeposit = 10000;
    let attestorCount = 3;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        protocol = accounts[1];
        user = accounts[2];
        someRandomAccount = accounts[3];

        const MockAttestorManager = await ethers.getContractFactory(
            'MockAttestorManager'
        );
        mockAttestorManager = await MockAttestorManager.deploy();
        await mockAttestorManager.deployTransaction.wait();

        const DLCManager = await ethers.getContractFactory('MockDLCManagerV1');
        dlcManager = await DLCManager.deploy(
            deployer.address,
            mockAttestorManager.address
        );
        await dlcManager.deployTransaction.wait();

        const DLCBTC = await ethers.getContractFactory(
            'DLCBTCExample',
            deployer
        );
        dlcBtc = await DLCBTC.deploy();
        await dlcBtc.deployed();

        const DepositDemo = await ethers.getContractFactory(
            'DepositDemo',
            protocol
        );
        depositDemo = await DepositDemo.deploy(
            dlcManager.address,
            dlcBtc.address,
            protocol.address
        );
        await depositDemo.deployTransaction.wait();

        await dlcManager
            .connect(deployer)
            .grantRole(
                web3.utils.soliditySha3('WHITELISTED_CONTRACT'),
                depositDemo.address
            );
        await dlcManager
            .connect(deployer)
            .grantRole(
                web3.utils.soliditySha3('WHITELISTED_WALLET'),
                protocol.address
            );
    });

    it('is deployed for the tests', async () => {
        expect(await depositDemo.deployTransaction).to.exist;
    });

    describe('setupDeposit', async () => {
        it('emits an event with the deposit details', async () => {
            const tx = await depositDemo
                .connect(user)
                .setupDeposit(btcDeposit, attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (ev) => ev.event === 'SetupDeposit'
            );
            expect(event.args).to.eql([
                mockUUID,
                BigNumber.from(btcDeposit),
                BigNumber.from(0),
                ['localhost', 'dlc.link/oracle', 'someAttestorDomain.com'],
                user.address,
            ]);
        });
        it('emits a StatusUpdate event', async () => {
            const tx = await depositDemo
                .connect(user)
                .setupDeposit(btcDeposit, attestorCount);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (ev) => ev.event === 'StatusUpdate'
            );
            expect(event.args).to.eql([
                BigNumber.from(0),
                mockUUID,
                Status.Ready,
            ]);
        });
        xit('sets up a new deposit object', async () => {
            const tx = await depositDemo
                .connect(user)
                .setupDeposit(btcDeposit, attestorCount);
            const receipt = await tx.wait();
            const deposit = await depositDemo.getDeposit(0);
        });
    });

    describe('setStatusFunded', async () => {
        it('reverts when not called by DLCManager', async () => {
            await expect(
                depositDemo.connect(someRandomAccount).setStatusFunded(mockUUID)
            ).to.be.revertedWith(
                'DepositDemo: must have dlc-manager role to perform this action'
            );
        });
        beforeEach(async () => {
            const tx = await depositDemo
                .connect(user)
                .setupDeposit(btcDeposit, attestorCount);
            const receipt = await tx.wait();
            await dlcManager.connect(protocol).setStatusFunded(mockUUID);
        });
        it('sets status to funded', async () => {
            const deposit = await depositDemo.getDeposit(0);
            expect(deposit.status).to.equal(Status.Funded);
        });
        it('sets depositAmount equal to the btcDeposit', async () => {
            const deposit = await depositDemo.getDeposit(0);
            expect(deposit.depositAmount).to.equal(btcDeposit);
        });
        it('mints btcDeposit amount of dlcBtc tokens to creator', async () => {
            const userBalance = await dlcBtc.balanceOf(user.address);
            expect(userBalance).to.equal(btcDeposit);
        });
    });

    describe('closeDeposit', async () => {
        it('reverts with Unauthorized when needed', async () => {
            await expect(
                depositDemo.connect(someRandomAccount).closeDeposit(0)
            ).to.be.revertedWith('Unauthorized');
        });
        beforeEach(async () => {
            const tx = await depositDemo
                .connect(user)
                .setupDeposit(btcDeposit, 3);
            const receipt = await tx.wait();
            const ssftx = await dlcManager
                .connect(protocol)
                .setStatusFunded(mockUUID);
            const ssfreceipt = await ssftx.wait();
        });
        it('reverts if no allowance was set', async () => {
            await expect(
                depositDemo.connect(user).closeDeposit(0)
            ).to.be.revertedWith('ERC20: insufficient allowance');
        });
        it('emits a StatusUpdate event', async () => {
            await dlcBtc.connect(user).approve(depositDemo.address, btcDeposit);
            const tx = await depositDemo.connect(user).closeDeposit(0);
            const receipt = await tx.wait();
            const event = receipt.events.find(
                (ev) => ev.event === 'StatusUpdate'
            );
            expect(event.args).to.eql([
                BigNumber.from(0),
                mockUUID,
                Status.PreClosed,
            ]);
        });
        it('sets the status of the deposit to preclosed', async () => {
            await dlcBtc.connect(user).approve(depositDemo.address, btcDeposit);
            await depositDemo.connect(user).closeDeposit(0);
            const deposit = await depositDemo.getDeposit(0);
            expect(deposit.status).to.equal(Status.PreClosed);
        });
        it('burns the dlcBtc tokens', async () => {
            const userBalanceBefore = await dlcBtc.balanceOf(user.address);
            expect(userBalanceBefore).to.equal(btcDeposit);
            await dlcBtc.connect(user).approve(depositDemo.address, btcDeposit);
            await depositDemo.connect(user).closeDeposit(0);
            const userBalance = await dlcBtc.balanceOf(user.address);
            expect(userBalance).to.equal(0);
        });
    });
});
