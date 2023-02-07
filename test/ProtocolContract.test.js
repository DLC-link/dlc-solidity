const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ProtocolContract', () => {
  let mockV3Aggregator;
  let dlcManager;
  let usdc;
  let protocolContract;
  let emergencyRefundTime;
  let deployer, protocol, user;

  beforeEach(async () => {
    emergencyRefundTime = 1988622969;

    // Setup accounts
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    protocol = accounts[1];
    user = accounts[2];
    someRandomAccount = accounts[3];

    const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');
    mockV3Aggregator = await MockV3Aggregator.deploy(0, 0); // NOTE:
    await mockV3Aggregator.deployTransaction.wait();

    const DLCManager = await ethers.getContractFactory('DLCManager');
    dlcManager = await DLCManager.deploy(deployer.address, mockV3Aggregator.address);
    await dlcManager.deployTransaction.wait();

    const USDC = await ethers.getContractFactory('USDStableCoinForDLCs');
    usdc = await USDC.deploy();
    await usdc.deployed();

    const ProtocolContract = await ethers.getContractFactory('ProtocolContract', protocol);
    protocolContract = await ProtocolContract.deploy(dlcManager.address, usdc.address);
    await protocolContract.deployTransaction.wait();

    await usdc.mint(protocolContract.address, ethers.utils.parseUnits("10000", "ether"));
  })

  it('is deployed for the tests', async () => {
    expect(await protocolContract.deployTransaction).to.exist;
  })

  describe('setupLoan', () => {
    xit('emits an event with loan data', () => { });
    xit('emits a StatusUpdate event', () => { });
    xit('sets up a new loan object with the correct status', () => { });
  });

  describe('borrow', () => {
    it('reverts if not called by the owner of the loan', async () => {
      await expect(protocolContract.borrow(123, 10)).to.be.revertedWith(
        "Unathorized"
      );
    })

    it('reverts if loan is not funded', async () => {
      const tx = await protocolContract.connect(user).setupLoan(0, 0, 0, 0);
      const txF = await tx.wait();
      await expect(protocolContract.connect(user).borrow(0, 10)).to.be.revertedWith(
        "Loan not funded"
      );
    })

    xit('reverts if user is undercollaterized', async () => {

    })

    it('transfers the amount to the user', async () => {
      const tx = await protocolContract.connect(user).setupLoan(100000000, 0, 0, 0);
      const txF = await tx.wait();
      const tx2 = await protocolContract.connect(protocol).setStatusFunded(txF.events[1].args.dlcUUID);
      const txF2 = await tx2.wait();

      const amount = 100;
      const amountBig = ethers.utils.parseUnits(amount.toString(), "ether")
      const amountBigNeg = ethers.utils.parseUnits((0 - amount).toString(), "ether")

      await expect(protocolContract.connect(user).borrow(0, amountBig)).to.changeTokenBalances(
        usdc,
        [protocolContract, user],
        [amountBigNeg, amountBig]
      );
    })

    xit('reduces the vaultLoan amount', async () => {

    })
  })

  describe('repay', async () => {
    const amount = 100;
    const amountBig = ethers.utils.parseUnits(amount.toString(), "ether")

    beforeEach(async () => {
      const tx = await protocolContract.connect(user).setupLoan(100000000, 0, amountBig, 0);
      const txF = await tx.wait();
      const tx2 = await protocolContract.connect(protocol).setStatusFunded(txF.events[1].args.dlcUUID);
      const txF2 = await tx2.wait();

      await protocolContract.connect(user).borrow(0, amountBig);
    })

    it('reverts if not called by the owner of the loan', async () => {
      await expect(protocolContract.repay(0, amountBig)).to.be.revertedWith(
        "Unathorized"
      );
    })

    it('reverts if _amount is larger than vaultLoan', async () => {
      await expect(protocolContract.connect(user).repay(0, amountBig + amountBig)).to.be.revertedWith(
        "Amount too large"
      );
    })

    it('reverts if owner has not set allowance', async () => {
      await expect(protocolContract.connect(user).repay(0, amountBig)).to.be.revertedWith('ERC20: insufficient allowance');
    })

    it('reverts if owner has insufficent balance', async () => {
      await usdc.connect(user).approve(protocolContract.address, amountBig);

      // Simulate that `user` spends the tokens elsewhere:
      await usdc.connect(user).transfer(someRandomAccount.address, amountBig.sub(amountBig.div(2)));

      await expect(protocolContract.connect(user).repay(0, amountBig)).to.be.revertedWith('ERC20: transfer amount exceeds balance');
    })

    it('transfers usdc tokens to contract', async () => {
      await usdc.mint(user.address, amountBig);
      await usdc.connect(user).approve(protocolContract.address, amountBig);

      const amountBigNeg = ethers.utils.parseUnits((0 - amount).toString(), "ether")

      await expect(protocolContract.connect(user).repay(0, amountBig)).to.changeTokenBalances(
        usdc,
        [protocolContract, user],
        [amountBig, amountBigNeg]
      );
    })
  })
})
