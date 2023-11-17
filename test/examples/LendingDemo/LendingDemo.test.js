const { expect } = require('chai');
const { ethers } = require('hardhat');

const someBtxTxId =
    '0x1234567890123456789012345678901234567890123456789012345678901234';

async function setupFundedLoan(
    dlcManager,
    lendingContract,
    deployer,
    protocol,
    user,
    loanParams = {
        btcDeposit: 100000000,
        // emergencyRefundTime: 5,
    }
) {
    const tx = await lendingContract
        .connect(user)
        .setupLoan(loanParams.btcDeposit);
    const txF = await tx.wait();
    const tx3 = await dlcManager
        .connect(protocol)
        .setStatusFunded(txF.events[1].args.dlcUUID, someBtxTxId);
    const txF3 = await tx3.wait();
}

describe('LendingContract', () => {
    let mockV3Aggregator;
    let mockAttestorManager;
    let dlcManager;
    let usdc;
    let lendingContract;
    let emergencyRefundTime;
    let deployer, protocol, user, someRandomAccount;

    beforeEach(async () => {
        emergencyRefundTime = 1988622969;

        // Setup accounts
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        protocol = accounts[1];
        user = accounts[2];
        someRandomAccount = accounts[3];

        const MockV3Aggregator =
            await ethers.getContractFactory('MockV3Aggregator');
        mockV3Aggregator = await MockV3Aggregator.deploy(0, 0); // NOTE:
        await mockV3Aggregator.deployTransaction.wait();

        const MockAttestorManager = await ethers.getContractFactory(
            'MockAttestorManager'
        );
        mockAttestorManager = await MockAttestorManager.deploy();
        await mockAttestorManager.deployTransaction.wait();

        const DLCManager = await ethers.getContractFactory('MockDLCManager');
        dlcManager = await DLCManager.deploy();
        await dlcManager.deployTransaction.wait();

        const USDC = await ethers.getContractFactory('USDStableCoinForDLCs');
        usdc = await USDC.deploy();
        await usdc.deployed();

        const LendingContract = await ethers.getContractFactory(
            'LendingContract',
            protocol
        );
        lendingContract = await LendingContract.deploy(
            dlcManager.address,
            usdc.address,
            protocol.address,
            mockV3Aggregator.address
        );
        await lendingContract.deployTransaction.wait();

        await usdc.mint(
            lendingContract.address,
            ethers.utils.parseUnits('10000', 'ether')
        );
    });

    it('is deployed for the tests', async () => {
        expect(await lendingContract.deployTransaction).to.exist;
    });

    describe('setupLoan', () => {
        xit('emits an event with loan data', () => {});
        xit('emits a StatusUpdate event', () => {});
        xit('sets up a new loan object with the correct status', () => {});
    });

    describe('borrow', () => {
        it('reverts if not called by the owner of the loan', async () => {
            await expect(lendingContract.borrow(123, 10)).to.be.revertedWith(
                'Unathorized'
            );
        });

        it('reverts if loan is not funded', async () => {
            const tx = await lendingContract.connect(user).setupLoan(0);
            const txF = await tx.wait();
            await expect(
                lendingContract.connect(user).borrow(0, 10)
            ).to.be.revertedWith('Loan not funded');
        });

        xit('reverts if user is undercollaterized', async () => {});

        it('transfers the amount to the user', async () => {
            await setupFundedLoan(
                dlcManager,
                lendingContract,
                deployer,
                protocol,
                user
            );

            const amount = 100;
            const amountBig = ethers.utils.parseUnits(
                amount.toString(),
                'ether'
            );
            const amountBigNeg = ethers.utils.parseUnits(
                (0 - amount).toString(),
                'ether'
            );

            await expect(
                lendingContract.connect(user).borrow(0, amountBig)
            ).to.changeTokenBalances(
                usdc,
                [lendingContract, user],
                [amountBigNeg, amountBig]
            );
        });

        it('increases the vaultLoan amount', async () => {
            await setupFundedLoan(
                dlcManager,
                lendingContract,
                deployer,
                protocol,
                user
            );

            const amount = 100;
            const amountBig = ethers.utils.parseUnits(
                amount.toString(),
                'ether'
            );

            let loan = await lendingContract.getLoan(0);
            expect(loan.vaultLoan).to.equal(0);

            await lendingContract.connect(user).borrow(0, amountBig);

            loan = await lendingContract.getLoan(0);
            expect(loan.vaultLoan).to.equal(amountBig);
        });
    });

    describe('repay', async () => {
        const amount = 100;
        const amountBig = ethers.utils.parseUnits(amount.toString(), 'ether');

        beforeEach(async () => {
            await setupFundedLoan(
                dlcManager,
                lendingContract,
                deployer,
                protocol,
                user
            );

            await lendingContract.connect(user).borrow(0, amountBig);
        });

        xit('reverts if not called by the owner of the loan', async () => {
            await expect(
                lendingContract.repay(0, amountBig)
            ).to.be.revertedWith('Unathorized');
        });

        it('reverts if _amount is larger than vaultLoan', async () => {
            await expect(
                lendingContract.connect(user).repay(0, amountBig + amountBig)
            ).to.be.revertedWith('Amount too large');
        });

        it('reverts if owner has not set allowance', async () => {
            await expect(
                lendingContract.connect(user).repay(0, amountBig)
            ).to.be.revertedWith('ERC20: insufficient allowance');
        });

        it('reverts if owner has insufficent balance', async () => {
            await usdc
                .connect(user)
                .approve(lendingContract.address, amountBig);

            // Simulate that `user` spends the tokens elsewhere:
            await usdc
                .connect(user)
                .transfer(
                    someRandomAccount.address,
                    amountBig.sub(amountBig.div(2))
                );

            await expect(
                lendingContract.connect(user).repay(0, amountBig)
            ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
        });

        it('transfers usdc tokens to contract', async () => {
            await usdc.mint(user.address, amountBig);
            await usdc
                .connect(user)
                .approve(lendingContract.address, amountBig);

            const amountBigNeg = ethers.utils.parseUnits(
                (0 - amount).toString(),
                'ether'
            );

            await expect(
                lendingContract.connect(user).repay(0, amountBig)
            ).to.changeTokenBalances(
                usdc,
                [lendingContract, user],
                [amountBig, amountBigNeg]
            );
        });

        xit('reverts if user is undercollaterized', async () => {});

        it('reduces the vaultLoan amount', async () => {
            let loan = await lendingContract.getLoan(0);
            expect(loan.vaultLoan).to.equal(amountBig);

            await usdc
                .connect(user)
                .approve(lendingContract.address, amountBig);

            await lendingContract.connect(user).repay(0, amountBig);

            loan = await lendingContract.getLoan(0);
            expect(loan.vaultLoan).to.equal(0);
        });
    });

    describe('getCollateralValue', () => {
        let amount = 130000000; // 1.3 BTC
        let price = 2283600000000;

        beforeEach(async () => {
            await setupFundedLoan(
                dlcManager,
                lendingContract,
                deployer,
                protocol,
                user,
                {
                    btcDeposit: amount,
                    // emergencyRefundTime: 5,
                }
            );
        });

        it('returns a value with correct format', async () => {
            const tx = await lendingContract.getCollateralValue(0, price);
            const value = tx.toNumber();
            expect(value).to.equal((amount * price) / 10 ** 8);
        });
    });

    describe('checkLiquidation', () => {
        let collateralAmount = 100000000; // 1 BTC
        let price = 2283600000000;
        let borrowedAmount = 10000;
        let borrowedBig = ethers.utils.parseUnits(
            borrowedAmount.toString(),
            'ether'
        );

        beforeEach(async () => {
            await setupFundedLoan(
                dlcManager,
                lendingContract,
                deployer,
                protocol,
                user,
                {
                    btcDeposit: collateralAmount,
                    // emergencyRefundTime: 5,
                }
            );
            await lendingContract.connect(user).borrow(0, borrowedBig);
        });

        it('returns false if collateral value is above liquidation threshold', async () => {
            const tx = await lendingContract.checkLiquidation(0, price);
            expect(tx).to.equal(false);
        });

        it('returns true if collateral value is below liquidation threshold', async () => {
            let lowPrice = 1390000000000;
            const tx = await lendingContract.checkLiquidation(0, lowPrice);
            expect(tx).to.equal(true);
        });
    });

    describe('calculatePayoutRatio', () => {
        let collateralAmount = 100000000; // 1 BTC
        let price = 2283600000000;
        let borrowedAmount = 10000; // 10000 USDC
        let borrowedBig = ethers.utils.parseUnits(
            borrowedAmount.toString(),
            'ether'
        );

        beforeEach(async () => {
            await setupFundedLoan(
                dlcManager,
                lendingContract,
                deployer,
                protocol,
                user,
                {
                    btcDeposit: collateralAmount,
                    // emergencyRefundTime: 5,
                }
            );
            await lendingContract.connect(user).borrow(0, borrowedBig);
        });

        it('returns the correct value', async () => {
            const value = await lendingContract.calculatePayoutRatio(0, price);

            expect(value).to.equal(4383);

            const value2 = await lendingContract.calculatePayoutRatio(
                0,
                1283600000000
            );
            expect(value2).to.equal(7798);

            const value3 = await lendingContract.calculatePayoutRatio(
                0,
                983600000000
            );
            expect(value3).to.equal(10000); // 100% payout ratio, capped at 10000
        });
    });
});
