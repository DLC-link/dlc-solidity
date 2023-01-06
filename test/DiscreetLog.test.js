const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('DiscreetLog', () => {
  let dlcManager;
  let emergencyRefundTime;

  beforeEach(async () => {
    emergencyRefundTime = 1988622969;

    const DiscreetLog = await ethers.getContractFactory('DiscreetLog');
    dlcManager = await DiscreetLog.deploy();
  })

  describe('createDLC', () => {
    it('emits a CreateDLC event with correct data', async () => {
      const transaction = await dlcManager.createDLC(emergencyRefundTime);
      const txReceipt = await transaction.wait();
      const event = txReceipt.events[0];

      expect(event.event).to.equal('CreateDLC');
      expect(event.args.uuid).to.not.equal(undefined);
      expect(event.args.creator).to.equal('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
      expect(event.args.emergencyRefundTime.toNumber()).to.equal(emergencyRefundTime);
      expect(event.args.eventSource).to.equal('dlclink:create-dlc:v0');
    })

    it('called multiple times generates unique UUIDs', async () => {
      const transaction = await dlcManager.createDLC(0);
      const txReceipt = await transaction.wait();
      const transaction2 = await dlcManager.createDLC(0);
      const txReceipt2 = await transaction2.wait();

      const uuid1 = txReceipt.events[0].args.uuid;
      const uuid2 = txReceipt2.events[0].args.uuid;
      expect(uuid1).to.not.equal(uuid2);
    })

  })



})
