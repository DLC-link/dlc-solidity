const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('WrappedIBTC', function () {
    let iBTC;
    let wrappedIBTC;
    let deployer;
    let user1;
    let user2;
    let someOtherToken;

    const initialDeposit = ethers.utils.parseUnits('10', 8); // 10 iBTC

    beforeEach(async () => {
        [deployer, user1, user2] = await ethers.getSigners();

        // Deploy the mock ERC20 token (for testing rescueTokens)
        const SomeOtherToken = await ethers.getContractFactory(
            'contracts/mocks/TestERC20.sol:TestERC20',
            deployer
        );
        someOtherToken = await SomeOtherToken.deploy('SomeOtherToken', 'SOT');
        await someOtherToken.deployed();

        // Deploy iBTC
        const IBTC = await ethers.getContractFactory('IBTC', deployer);
        iBTC = await upgrades.deployProxy(IBTC);
        await iBTC.deployed();

        // Deploy WrappedIBTC
        const WrappedIBTC = await ethers.getContractFactory(
            'WrappedIBTC',
            deployer
        );
        wrappedIBTC = await WrappedIBTC.deploy(iBTC.address, deployer.address);
        await wrappedIBTC.deployed();

        // Mint some iBTC to user1 for testing deposits
        await iBTC.mint(user1.address, initialDeposit);
    });

    it('should deploy successfully', async () => {
        expect(wrappedIBTC.address).to.not.equal(0);
        expect(await wrappedIBTC.asset()).to.equal(iBTC.address);
        expect(await wrappedIBTC.name()).to.equal('Wrapped iBTC');
        expect(await wrappedIBTC.symbol()).to.equal('wiBTC');
    });

    it('should allow deposits and mint wiBTC', async () => {
        // Approve
        await iBTC.connect(user1).approve(wrappedIBTC.address, initialDeposit);

        // Deposit
        const tx = await wrappedIBTC
            .connect(user1)
            .deposit(initialDeposit, user1.address);
        await tx.wait();

        expect(await wrappedIBTC.balanceOf(user1.address)).to.equal(
            initialDeposit
        );
        expect(await wrappedIBTC.totalSupply()).to.equal(initialDeposit);
        expect(await iBTC.balanceOf(wrappedIBTC.address)).to.equal(
            initialDeposit
        );
    });

    it('should allow minting wiBTC and deposit', async () => {
        // Approve
        await iBTC.connect(user1).approve(wrappedIBTC.address, initialDeposit);

        // Mint shares
        const tx = await wrappedIBTC
            .connect(user1)
            .mint(initialDeposit, user1.address);
        await tx.wait();

        expect(await wrappedIBTC.balanceOf(user1.address)).to.equal(
            initialDeposit
        );
        expect(await wrappedIBTC.totalSupply()).to.equal(initialDeposit);
        expect(await iBTC.balanceOf(wrappedIBTC.address)).to.equal(
            initialDeposit
        );
    });

    it('should allow withdraw and burn wiBTC', async () => {
        // Deposit first
        await iBTC.connect(user1).approve(wrappedIBTC.address, initialDeposit);
        await wrappedIBTC.connect(user1).deposit(initialDeposit, user1.address);

        // Withdraw
        const tx = await wrappedIBTC
            .connect(user1)
            .withdraw(initialDeposit, user1.address, user1.address);
        await tx.wait();

        expect(await wrappedIBTC.balanceOf(user1.address)).to.equal(0);
        expect(await wrappedIBTC.totalSupply()).to.equal(0);
        expect(await iBTC.balanceOf(user1.address)).to.equal(initialDeposit);
        expect(await iBTC.balanceOf(wrappedIBTC.address)).to.equal(0);
    });

    it('should allow redeeming wiBTC and burn', async () => {
        // Deposit first
        await iBTC.connect(user1).approve(wrappedIBTC.address, initialDeposit);
        await wrappedIBTC.connect(user1).deposit(initialDeposit, user1.address);

        // Redeem
        const tx = await wrappedIBTC
            .connect(user1)
            .redeem(initialDeposit, user1.address, user1.address);
        await tx.wait();

        expect(await wrappedIBTC.balanceOf(user1.address)).to.equal(0);
        expect(await wrappedIBTC.totalSupply()).to.equal(0);
        expect(await iBTC.balanceOf(user1.address)).to.equal(initialDeposit);
        expect(await iBTC.balanceOf(wrappedIBTC.address)).to.equal(0);
    });

    it('should allow owner to rescue ERC20 tokens', async () => {
        const amount = ethers.utils.parseUnits('100', 18); // Assuming SOT has 18 decimals
        // Transfer some SOT tokens to the contract by mistake
        await someOtherToken.transfer(wrappedIBTC.address, amount);

        // Check balance before rescue
        expect(await someOtherToken.balanceOf(wrappedIBTC.address)).to.equal(
            amount
        );
        const initialSupply = ethers.utils.parseUnits('1000', 18);
        expect(await someOtherToken.balanceOf(deployer.address)).to.equal(
            initialSupply.sub(amount)
        );

        // Rescue tokens
        await wrappedIBTC.rescueTokens(
            someOtherToken.address,
            amount,
            deployer.address
        );

        // Check balance after rescue
        expect(await someOtherToken.balanceOf(wrappedIBTC.address)).to.equal(0);
        expect(await someOtherToken.balanceOf(deployer.address)).to.equal(
            initialSupply
        );
    });

    it('should not allow rescuing iBTC tokens', async () => {
        // Attempt to rescue iBTC tokens
        await expect(
            wrappedIBTC.rescueTokens(
                iBTC.address,
                initialDeposit,
                deployer.address
            )
        ).to.be.revertedWithCustomError(wrappedIBTC, 'InvalidToken');
    });

    it('should return correct maxWithdraw', async () => {
        // Approve and deposit
        await iBTC.connect(user1).approve(wrappedIBTC.address, initialDeposit);
        await wrappedIBTC.connect(user1).deposit(initialDeposit, user1.address);

        expect(await wrappedIBTC.maxWithdraw(user1.address)).to.equal(
            initialDeposit
        );
    });

    it('should return correct maxRedeem', async () => {
        // Approve and deposit
        await iBTC.connect(user1).approve(wrappedIBTC.address, initialDeposit);
        await wrappedIBTC.connect(user1).deposit(initialDeposit, user1.address);

        expect(await wrappedIBTC.maxRedeem(user1.address)).to.equal(
            initialDeposit
        );
    });

    it('should return correct previewWithdraw', async () => {
        // Approve and deposit
        await iBTC.connect(user1).approve(wrappedIBTC.address, initialDeposit);
        await wrappedIBTC.connect(user1).deposit(initialDeposit, user1.address);

        expect(await wrappedIBTC.previewWithdraw(initialDeposit)).to.equal(
            initialDeposit
        );
    });

    it('should return correct previewRedeem', async () => {
        // Approve and deposit
        await iBTC.connect(user1).approve(wrappedIBTC.address, initialDeposit);
        await wrappedIBTC.connect(user1).deposit(initialDeposit, user1.address);

        expect(await wrappedIBTC.previewRedeem(initialDeposit)).to.equal(
            initialDeposit
        );
    });

    it('should return correct previewDeposit', async () => {
        expect(await wrappedIBTC.previewDeposit(initialDeposit)).to.equal(
            initialDeposit
        );
    });

    it('should return correct previewMint', async () => {
        expect(await wrappedIBTC.previewMint(initialDeposit)).to.equal(
            initialDeposit
        );
    });

    it('should return correct convertToShares', async () => {
        expect(await wrappedIBTC.convertToShares(initialDeposit)).to.equal(
            initialDeposit
        );
    });

    it('should return correct convertToAssets', async () => {
        expect(await wrappedIBTC.convertToAssets(initialDeposit)).to.equal(
            initialDeposit
        );
    });
});
