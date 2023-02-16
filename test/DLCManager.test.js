const { expect } = require('chai');
const { ethers } = require('hardhat');

const Status = {
  None: 0,
  NotReady: 1,
  Ready: 2,
  Funded: 3,
  PreRepaid: 4,
  Repaid: 5,
  PreLiquidated: 6,
  Liquidated: 7
}

describe('DLCManager', () => {
  let mockV3Aggregator;
  let dlcManager;
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

    const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');
    mockV3Aggregator = await MockV3Aggregator.deploy(0, 0); //NOTE:
    await mockV3Aggregator.deployTransaction.wait();

    const DLCManager = await ethers.getContractFactory('DLCManager');
    dlcManager = await DLCManager.deploy(deployer.address, mockV3Aggregator.address);
    await dlcManager.deployTransaction.wait();

    const ProtocolContract = await ethers.getContractFactory('ProtocolContract', protocol);
    // not really the usdc address, but we aren't testing borrow-repay in this file
    protocolContract = await ProtocolContract.deploy(dlcManager.address, '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512');
    await protocolContract.deployTransaction.wait();
  })

  describe('createDLC', () => {
    it('emits an event with correct data', async () => {
      const transaction = await dlcManager.createDLC(emergencyRefundTime, 0);
      const txReceipt = await transaction.wait();
      const event = txReceipt.events.find(ev => ev.event == 'CreateDLC');

      expect(event.event).to.equal('CreateDLC');
      expect(event.args.uuid).to.not.equal(undefined);
      expect(event.args.creator).to.equal('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
      expect(event.args.emergencyRefundTime.toNumber()).to.equal(emergencyRefundTime);
      expect(event.args.eventSource).to.equal('dlclink:create-dlc:v0');
    })

    it('called multiple times generates unique UUIDs', async () => {
      const transaction = await dlcManager.createDLC(0, 0);
      const txReceipt = await transaction.wait();
      const transaction2 = await dlcManager.createDLC(0, 1);
      const txReceipt2 = await transaction2.wait();

      const uuid1 = txReceipt.events[0].args.uuid;
      const uuid2 = txReceipt2.events[0].args.uuid;
      expect(uuid1).to.not.equal(uuid2);
    })
  })

  // TODO:
  // - access control checking
  // - can't call it twice on same uuid
  describe('postCreateDLC', async () => {
    let uuid, nonce, owner, creator;

    beforeEach(async () => {
      const setupLoanTx = await protocolContract.connect(user).setupLoan(1, 14000, 1000, emergencyRefundTime);
      const txReceipt = await setupLoanTx.wait();

      const setupLoanEvent = txReceipt.events.find(event => event.event == 'SetupLoan');
      uuid = setupLoanEvent.args.dlcUUID;
      nonce = setupLoanEvent.args.index;
      owner = setupLoanEvent.args.owner // the user, not the protocol-contract
      creator = setupLoanEvent.address; // the protocol-contract
    })

    it('emits an event with correct data', async () => {
      const postCreateTx = await dlcManager.connect(deployer).postCreateDLC(uuid, emergencyRefundTime, nonce, creator, owner);
      const txReceipt2 = await postCreateTx.wait();
      const event = txReceipt2.events.find(event => event.event == 'PostCreateDLC');

      expect(Object.keys(event.args).filter(key => isNaN(key)).length).to.equal(6) // for some reason the event args appear twice, once with a key and once without.
      expect(event.args.uuid).to.equal(uuid);
      expect(event.args.eventSource).to.equal('dlclink:post-create-dlc:v0');
      expect(event.args.creator).to.equal(creator);
      expect(event.args.receiver).to.equal(owner);
      expect(event.args.emergencyRefundTime).to.equal(emergencyRefundTime);
      expect(event.args.nonce).to.equal(nonce);
    })

    it('calls back into the provided protocol contract', async () => {
      // check if postCreateDLCHandler was called successfully
      // by checking if loan status has been updated
      let loan = await protocolContract.getLoan(nonce);

      // Not Ready before tx
      expect(loan.status).to.equal(Status.NotReady);

      const postCreateTx = await dlcManager.connect(deployer).postCreateDLC(uuid, emergencyRefundTime, nonce, creator, owner);
      await postCreateTx.wait();

      // Ready after tx
      loan = await protocolContract.getLoan(nonce);
      expect(loan.status).to.equal(Status.Ready);
      expect(loan.owner).to.equal(owner);
      expect(loan.dlcUUID).to.equal(uuid);

    })

    it('creates a DLC object', async () => {
      // Before tx
      let dlc = await dlcManager.getDLC(uuid);
      expect(dlc.uuid).to.equal('0x0000000000000000000000000000000000000000000000000000000000000000');

      const postCreateTx = await dlcManager.connect(deployer).postCreateDLC(uuid, emergencyRefundTime, nonce, creator, owner);
      await postCreateTx.wait();

      // After tx
      dlc = await dlcManager.getDLC(uuid);

      expect(dlc.uuid).to.equal(uuid);
      expect(dlc.emergencyRefundTime).to.equal(emergencyRefundTime);
      expect(dlc.creator).to.equal(creator);
      expect(dlc.nonce).to.equal(nonce);
    })

    it('adds the UUID to the openUUIDs array', async () => {
      let openUUIDs = await dlcManager.getAllUUIDs();
      expect(openUUIDs).to.be.empty;

      const postCreateTx = await dlcManager.connect(deployer).postCreateDLC(uuid, emergencyRefundTime, nonce, creator, owner);
      const txReceipt2 = await postCreateTx.wait();

      openUUIDs = await dlcManager.getAllUUIDs();
      expect(openUUIDs).to.contain(uuid);
    })


  })

  describe('setStatusFunded', async () => {
    let uuid, nonce, owner, creator;

    beforeEach(async () => {
      const setupLoanTx = await protocolContract.connect(user).setupLoan(1, 14000, 1000, emergencyRefundTime);
      const txReceipt = await setupLoanTx.wait();

      const setupLoanEvent = txReceipt.events.find(event => event.event == 'SetupLoan');
      uuid = setupLoanEvent.args.dlcUUID;
      nonce = setupLoanEvent.args.index;
      owner = setupLoanEvent.args.owner // the user, not the protocol-contract
      creator = setupLoanEvent.address; // the protocol-contract

      const postCreateTx = await dlcManager.connect(deployer).postCreateDLC(uuid, emergencyRefundTime, nonce, creator, owner);
      await postCreateTx.wait();
    })

    it('calls back into the creator contract', async () => {
      let loan = await protocolContract.getLoan(nonce);
      expect(loan.status).to.not.equal(Status.Funded);

      const setFundedTx = await dlcManager.setStatusFunded(uuid);
      await setFundedTx.wait();

      // Ready after tx
      loan = await protocolContract.getLoan(nonce);
      expect(loan.status).to.equal(Status.Funded);
    })

    it('emits an event with correct data', async () => {
      const setFundedTx = await dlcManager.setStatusFunded(uuid);
      const txReceipt = await setFundedTx.wait();
      const event = txReceipt.events.find(event => event.event == 'SetStatusFunded');

      expect(event.args.uuid).to.equal(uuid);
      expect(event.args.eventSource).to.equal('dlclink:set-status-funded:v0');
    })

  })

})
