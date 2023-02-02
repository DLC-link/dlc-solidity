const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ProtocolContract', () => {

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

    const DiscreetLog = await ethers.getContractFactory('DiscreetLog');
    dlcManager = await DiscreetLog.deploy();
    await dlcManager.deployTransaction.wait();

    const USDC = await ethers.getContractFactory('USDStableCoinForDLCs');
    usdc = await USDC.deploy();
    await usdc.deployed();

    const ProtocolContract = await ethers.getContractFactory('ProtocolContract', protocol);
    protocolContract = await ProtocolContract.deploy(usdc.address);
    await protocolContract.deployTransaction.wait();

    await usdc.mint(protocolContract.address, 100000000);
  })

  it('is deployed for the tests', async () => {
    expect(await protocolContract.deployTransaction).to.exist;
  })

  describe('setupLoan', () => {
    xit('emits an event with loan data', ()=>{});
    xit('emits a StatusUpdate event', () => {});
    xit('sets up a new loan object with the correct status', () => {});
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
      const tx = await protocolContract.connect(user).setupLoan(0, 0, 0, 0);
      const txF = await tx.wait();
      const tx2 = await protocolContract.connect(protocol).setStatusFunded(txF.events[1].args.dlcUUID);
      const txF2 = await tx2.wait();

      const amount = 1000;

      await expect(protocolContract.connect(user).borrow(0, amount)).to.changeTokenBalances(
        usdc,
        [protocolContract, user],
        [-amount, amount]
      );
    })

  })

})
