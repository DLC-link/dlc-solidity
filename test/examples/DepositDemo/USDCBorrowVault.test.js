const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');
const web3 = require('web3');

describe('USDCBorrowVault', function () {
    let mockAttestorManager;
    let dlcManager;
    let dlcBtc;
    let depositDemo, usdcBorrowVault, usdc, mockV3Aggregator;
    let emergencyRefundTime;
    let deployer, protocol, user, someRandomAccount;

    let mockUUID =
        '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967';
    let btcDeposit = 1000000; //sats
    let usdcReserve = '100000'; //usdc
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

        const DLCBTC = await ethers.getContractFactory('DLCBTC', deployer);
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

        const MockV3Aggregator = await ethers.getContractFactory(
            'MockV3Aggregator'
        );
        mockV3Aggregator = await MockV3Aggregator.deploy(8, 2612647400000); // NOTE:
        await mockV3Aggregator.deployTransaction.wait();

        const USDC = await ethers.getContractFactory(
            'USDStableCoinForDLCs',
            deployer
        );
        usdc = await USDC.deploy();
        await usdc.deployed();

        const USDCBorrowVault = await ethers.getContractFactory(
            'USDCBorrowVault',
            protocol
        );
        usdcBorrowVault = await USDCBorrowVault.deploy(
            dlcBtc.address,
            'vaultDLCBTC',
            'vDLCBTC',
            usdc.address,
            mockV3Aggregator.address
        );
        await usdcBorrowVault.deployTransaction.wait();

        await usdc.mint(
            usdcBorrowVault.address,
            ethers.utils.parseUnits(usdcReserve, 'ether')
        );

        const tx = await depositDemo
            .connect(user)
            .setupDeposit(btcDeposit, attestorCount);
        const receipt = await tx.wait();
        await dlcManager.connect(protocol).setStatusFunded(mockUUID);
    });

    it('is deployed for the tests', async () => {
        expect(await usdcBorrowVault.deployTransaction).to.exist;
    });

    it('its intended user has dlcBTC to deposit', async () => {
        expect(await dlcBtc.balanceOf(user.address)).to.equal(btcDeposit);
    });

    it('has USDC reserves to lend out', async () => {
        console.log(await usdc.balanceOf(usdcBorrowVault.address));
        expect(await usdc.balanceOf(usdcBorrowVault.address)).to.equal(
            ethers.utils.parseUnits(usdcReserve, 'ether')
        );
    });

    describe('deposit', async () => {
        const depositAmount = 500000; //sats
        let _receipt;

        it('reverts without setting an allowance', async () => {
            await expect(
                usdcBorrowVault.connect(user)._deposit(depositAmount)
            ).to.be.revertedWith('TRANSFER_FROM_FAILED');
        });

        beforeEach(async () => {
            await dlcBtc
                .connect(user)
                .approve(usdcBorrowVault.address, depositAmount);
            const tx = await usdcBorrowVault
                .connect(user)
                ._deposit(depositAmount);
            _receipt = await tx.wait();
        });

        it('emits an event with the deposit details', async () => {
            const event = _receipt.events.find((ev) => ev.event === 'Deposit');
            expect(event.args).to.eql([
                user.address,
                user.address,
                BigNumber.from(depositAmount),
                BigNumber.from(depositAmount),
            ]);
        });

        it('sends USDC to the user', async () => {
            // price/1e8 * depositAmount = usdcBalance
            // 2612647400000 * 500000 = 1306323700000000000
            expect(await usdc.balanceOf(user.address)).to.equal(
                ethers.utils.parseUnits('130.63237', 'ether')
            );
        });

        it('sends dlcBTC to the vault', async () => {
            expect(await dlcBtc.balanceOf(usdcBorrowVault.address)).to.equal(
                depositAmount
            );
            expect(await usdcBorrowVault.totalAssets()).to.equal(depositAmount);
        });

        it("updates the user's vDLCBTC balance", async () => {
            const balance = await usdcBorrowVault.balanceOf(user.address);
            expect(balance).to.equal(depositAmount);
        });

        xit('updates the user deposit balance', async () => {
            expect(
                await usdcBorrowVault.totalAssetsOfUser(user.address)
            ).to.equal(depositAmount);
        });
    });

    describe('withdraw', async () => {
        const depositAmount = 500000; //sats
        const usdcBalance = ethers.utils.parseUnits('130.63237', 'ether');

        xit('reverts if _receiver address is zero', async () => {});
        xit('reverts if user is not a shareholder', async () => {});

        beforeEach(async () => {
            await dlcBtc
                .connect(user)
                .approve(usdcBorrowVault.address, depositAmount);
            const tx = await usdcBorrowVault
                .connect(user)
                ._deposit(depositAmount);
            await tx.wait();
        });

        it("reverts if user doesn't have enough shares", async () => {
            await expect(
                usdcBorrowVault
                    .connect(user)
                    ._withdraw(depositAmount + 1, user.address)
            ).to.be.revertedWith('Not enough shares');
        });

        it('reverts if user has not set USDC allowance', async () => {
            await expect(
                usdcBorrowVault
                    .connect(user)
                    ._withdraw(depositAmount, user.address)
            ).to.be.revertedWith('ERC20: insufficient allowance');
        });

        it("reverts if user doesn't have enough USDC", async () => {
            await usdc.connect(user).transfer(someRandomAccount.address, 100);
            await usdc
                .connect(user)
                .approve(usdcBorrowVault.address, usdcBalance);
            await expect(
                usdcBorrowVault
                    .connect(user)
                    ._withdraw(depositAmount, user.address)
            ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
        });

        async function happyPathWithdraw() {
            await usdc
                .connect(user)
                .approve(usdcBorrowVault.address, usdcBalance);
            const tx = await usdcBorrowVault
                .connect(user)
                ._withdraw(depositAmount, user.address);
            return await tx.wait();
        }

        it('emits an event with the withdraw details', async () => {
            const _receipt = await happyPathWithdraw();
            const event = _receipt.events.find((ev) => ev.event === 'Withdraw');
            expect(event.args).to.eql([
                user.address,
                user.address,
                user.address,
                BigNumber.from(depositAmount),
                BigNumber.from(depositAmount),
            ]);
        });

        it('returns USDC to the vault', async () => {
            await happyPathWithdraw();

            expect(await usdc.balanceOf(usdcBorrowVault.address)).to.equal(
                ethers.utils.parseUnits(usdcReserve, 'ether')
            );
            expect(await usdc.balanceOf(user.address)).to.equal(0);
        });

        it('returns dlcBTC to the user', async () => {
            expect(await dlcBtc.balanceOf(user.address)).to.equal(
                btcDeposit - depositAmount
            );

            await happyPathWithdraw();

            expect(await dlcBtc.balanceOf(user.address)).to.equal(btcDeposit);
        });

        xit('updates the user deposit balance', async () => {
            expect(
                await usdcBorrowVault.totalAssetsOfUser(user.address)
            ).to.equal(depositAmount);

            await happyPathWithdraw();

            expect(
                await usdcBorrowVault.totalAssetsOfUser(user.address)
            ).to.equal(0);
        });
    });
});
