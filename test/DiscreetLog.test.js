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

describe('DiscreetLog', () => {
  let dlcManager;
  let protocolContract;
  let emergencyRefundTime;

  beforeEach(async () => {
    emergencyRefundTime = 1988622969;

    const DiscreetLog = await ethers.getContractFactory('DiscreetLog');
    dlcManager = await DiscreetLog.deploy();
    const ProtocolContract = await ethers.getContractFactory('ProtocolContract');
    protocolContract = await ProtocolContract.deploy();
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

  describe('postCreateDLC', async () => {
    let uuid, nonce, owner, creator;

    beforeEach(async () => {
      const setupLoanTx = await protocolContract.setupLoan(1, 14000, 1000, emergencyRefundTime);
      const txReceipt = await setupLoanTx.wait();

      const setupLoanEvent = txReceipt.events.find(event => event.event == 'SetupLoan');
      uuid = setupLoanEvent.args.dlcUUID;
      nonce = setupLoanEvent.args.numLoans;
      owner = setupLoanEvent.args.owner // the user, not the protocol-contract
      creator = setupLoanEvent.address; // the protocol-contract
    })

    it('emits an event with correct data', async () => {
      const postCreateTx = await dlcManager.postCreateDLC(uuid, emergencyRefundTime, nonce, creator);
      const txReceipt2 = await postCreateTx.wait();
      const event = txReceipt2.events.find(event => event.event == 'PostCreateDLC');

      expect(event.args.uuid).to.equal(uuid);
      expect(event.args.eventSource).to.equal('dlclink:post-create-dlc:v0');
      expect(event.args.creator).to.equal(creator);
      expect(event.args.emergencyRefundTime).to.equal(emergencyRefundTime);
      expect(event.args.nonce).to.equal(nonce);
    })

    it('calls back into the provided protocol contract', async () => {
      const postCreateTx = await dlcManager.postCreateDLC(uuid, emergencyRefundTime, nonce, creator);
      const txReceipt2 = await postCreateTx.wait();

      // check if postCreateDLCHandler was called successfully
      // by checking if its status has been updated
      const loan = await protocolContract.getLoan(nonce);

      expect(loan.status).to.equal(Status.Ready);
      expect(loan.owner).to.equal(owner);
      expect(loan.dlcUUID).to.equal(uuid);

    })
  })



})
