const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');


const mockDlcUUID = '0x126d6d95b8b724bbe0b2b91baa3b836eb8b601272ab945c23b68db3b1cfdcdc3';
const ReadyStatus = 2;

describe('BrokerContract', () => {
    let mockV3Aggregator;
    let mockDlcManager;
    let brokerContract;
    let emergencyRefundTime;
    let deployer, broker, user;
    let btcCollateral;

    beforeEach(async () => {
        emergencyRefundTime = 1988622969;
        btcCollateral = 1000;

        // Setup accounts
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        broker = accounts[1];
        user = accounts[2];
        someRandomAccount = accounts[3];

        const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');
        mockV3Aggregator = await MockV3Aggregator.deploy(0, 0); // NOTE:
        await mockV3Aggregator.deployTransaction.wait();

        const MockDLCManager = await ethers.getContractFactory('MockDLCManager');
        mockDlcManager = await MockDLCManager.deploy(deployer.address, mockV3Aggregator.address);
        await mockDlcManager.deployTransaction.wait();

        const MockBtcNft = await ethers.getContractFactory('MockBtcNft');
        MockBtcNftContract = await MockBtcNft.deploy();
        await MockBtcNftContract.deployed();

        const BrokerContract = await ethers.getContractFactory('DlcBroker', broker);
        brokerContract = await BrokerContract.deploy(mockDlcManager.address, MockBtcNftContract.address);
        await brokerContract.deployTransaction.wait();
    })

    it('is deployed for the tests', async () => {
        expect(await brokerContract.deployTransaction).to.exist;
    })

    describe('setupVault', async () => {
        it('emits an event with vault data', async () => {
            const transaction = await brokerContract.setupVault(btcCollateral, emergencyRefundTime);
            const txReceipt = await transaction.wait();
            const event = txReceipt.events.find(ev => ev.event == 'SetupVault');
            // const dlcUUID = event.args.dlcUUID
            expect(event.args).to.eql([mockDlcUUID, BigNumber.from(btcCollateral), BigNumber.from(emergencyRefundTime), BigNumber.from(0), broker.address])
        });
        xit('emits a StatusUpdate event', () => { });
        xit('sets up a new vault object with the correct status', () => { });
    })

    describe('mintNft', async () => {
        beforeEach(async () => {
            await brokerContract.connect(user).setupVault(btcCollateral, emergencyRefundTime);
        })
        // move this to the dlcManager
        it('emits a create NFT event from the DLCManager contract', async () => {
            await brokerContract.postCreateDLCHandler(mockDlcUUID)
            const postCreateTx = await brokerContract.setStatusFunded(mockDlcUUID)
            const txReceipt = await postCreateTx.wait();
            const event = txReceipt.events.find(ev => ev.event == 'MintBtcNft');
            expect(event.args).to.eql([mockDlcUUID, BigNumber.from(btcCollateral)])
            expect(event.address).to.equal(mockDlcManager.address);
        })
        describe('after the mintNft callback returns from the DLCManager', async () => {
            let postMintEvent;
            beforeEach(async () => {
                const postCreateTx = await brokerContract.postMintBtcNft(mockDlcUUID, 1)
                const txReceipt = await postCreateTx.wait()
                postMintEvent = txReceipt.events.find(ev => ev.event == 'MintBtcNft')
                await brokerContract.postCreateDLCHandler(mockDlcUUID) // updates the status to ready
            })
            it('emits the mintDlcNft event from the broker contract', async () => {
                expect(postMintEvent.args).to.eql([mockDlcUUID, BigNumber.from(1)])
                expect(postMintEvent.address).to.equal(brokerContract.address);
            })
            it('stores the nftId after the mintNft callback', async () => {
                const vault = await brokerContract.getVaultByUUID(mockDlcUUID);
                expect(vault).to.eql(
                    [BigNumber.from(0), mockDlcUUID, ReadyStatus, BigNumber.from(btcCollateral), BigNumber.from(1), user.address],
                );
            })
        })
        describe('after the mintNft callback returns from the DLCManager', async () => {
            let postMintEvent;
            beforeEach(async () => {
                await brokerContract.postMintBtcNft(mockDlcUUID, 1)
                const vaultId = await brokerContract.getVaultByUUID(mockDlcUUID)
                console.log(vaultId.id)
                const postCreateTx = await brokerContract.closeVault(vaultId.id)
                const txReceipt = await postCreateTx.wait()
                postMintEvent = txReceipt.events.find(ev => ev.event == 'BurnBtcNft')
                await brokerContract.postCreateDLCHandler(mockDlcUUID) // updates the status to ready
            })
            it('emits the burnDlcNft event from the broker contract', async () => {
                expect(postMintEvent.args).to.eql([mockDlcUUID, BigNumber.from(1)])
                expect(postMintEvent.address).to.equal(brokerContract.address);
            })
        })
    })
})
