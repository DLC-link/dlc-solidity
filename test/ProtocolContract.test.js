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
  })

  it('is deployed for the tests', async () => {
    expect(await protocolContract.deployTransaction).to.exist;
  })

  describe('setupLoan', () => {
    it('emits an event with loan data', ()=>{});
    it('emits a StatusUpdate event', () => {});
    it('sets up a new loan object with the correct status', () => {});
  });

  describe('borrow', () => {
    it('')
  })

})
