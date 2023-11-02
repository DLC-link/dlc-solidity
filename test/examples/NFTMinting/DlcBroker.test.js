const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

const mockDlcUUID =
    '0x126d6d95b8b724bbe0b2b91baa3b836eb8b601272ab945c23b68db3b1cfdcdc3';
let Status = {
    None: 0,
    NotReady: 1,
    Ready: 2,
    Funded: 3,
    NftIssued: 4,
    PreRepaid: 5,
    Repaid: 6,
    PreLiquidated: 7,
    Liquidated: 8,
};

//  These need to updated for our most recent implementation
xdescribe('BrokerContract', () => {
    let mockV3Aggregator;
    let mockDlcManager;
    let brokerContract;
    let DLCBTCExample;
    let emergencyRefundTime;
    let deployer, broker, user;
    let btcCollateral;

    beforeEach(async () => {
        emergencyRefundTime = 1988622969;
        btcCollateral = 1000; //sats

        // Setup accounts
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        broker = accounts[1];
        user = accounts[2];
        someRandomAccount = accounts[3];
        liquidator = accounts[4];

        const MockV3Aggregator =
            await ethers.getContractFactory('MockV3Aggregator');
        mockV3Aggregator = await MockV3Aggregator.deploy(0, 0); // NOTE:
        await mockV3Aggregator.deployTransaction.wait();

        const MockDLCManager = await ethers.getContractFactory(
            'MockDLCManagerV1',
            deployer
        );
        mockDlcManager = await MockDLCManager.deploy(
            deployer.address,
            mockV3Aggregator.address
        );
        await mockDlcManager.deployTransaction.wait();

        const MockBtcNft = await ethers.getContractFactory('MockBtcNft');
        mockBtcNftContract = await MockBtcNft.deploy();
        await mockBtcNftContract.deployed();

        const DLCBTCExample = await ethers.getContractFactory(
            'DLCBTCExample',
            deployer
        );
        DLCBTCExample = await DLCBTCExample.deploy();
        await DLCBTCExample.deployed();

        const BrokerContract = await ethers.getContractFactory(
            'DlcRouterV1',
            broker
        );
        brokerContract = await BrokerContract.deploy(
            mockDlcManager.address,
            mockBtcNftContract.address,
            DLCBTCExample.address
        );
        await brokerContract.deployTransaction.wait();
    });

    it('is deployed for the tests', async () => {
        expect(await brokerContract.deployTransaction).to.exist;
    });

    describe('setupVault', async () => {
        it('emits an event with vault data', async () => {
            const transaction = await brokerContract.setupVault(
                btcCollateral,
                emergencyRefundTime
            );
            const txReceipt = await transaction.wait();
            const event = txReceipt.events.find(
                (ev) => ev.event == 'SetupVault'
            );
            // const dlcUUID = event.args.dlcUUID
            expect(event.args).to.eql([
                mockDlcUUID,
                BigNumber.from(btcCollateral),
                BigNumber.from(emergencyRefundTime),
                BigNumber.from(0),
                broker.address,
            ]);
        });
        xit('emits a StatusUpdate event', () => {});
        xit('sets up a new vault object with the correct status', () => {});
    });

    describe('mintNft', async () => {
        beforeEach(async () => {
            await brokerContract
                .connect(user)
                .setupVault(btcCollateral, emergencyRefundTime);
        });
        // move this to the dlcManager
        it('emits a create NFT event from the DLCManager contract', async () => {
            await brokerContract.postCreateDLCHandler(mockDlcUUID);
            const postCreateTx =
                await brokerContract.setStatusFunded(mockDlcUUID);
            const txReceipt = await postCreateTx.wait();
            const event = txReceipt.events.find(
                (ev) => ev.event == 'MintBtcNft'
            );
            expect(event.args).to.eql([
                mockDlcUUID,
                BigNumber.from(btcCollateral),
            ]);
            expect(event.address).to.equal(mockDlcManager.address);
        });
        describe('after the mintNft callback returns from the DLCManager', async () => {
            let postMintEvent;
            beforeEach(async () => {
                const postCreateTx = await brokerContract.postMintBtcNft(
                    mockDlcUUID,
                    1
                );
                const txReceipt = await postCreateTx.wait();
                postMintEvent = txReceipt.events.find(
                    (ev) => ev.event == 'MintBtcNft'
                );
                await brokerContract.postCreateDLCHandler(mockDlcUUID); // updates the status to ready
            });
            it('emits the mintDlcNft event from the broker contract', async () => {
                expect(postMintEvent.args).to.eql([
                    mockDlcUUID,
                    BigNumber.from(1),
                ]);
                expect(postMintEvent.address).to.equal(brokerContract.address);
            });
            it('stores the nftId after the mintNft callback', async () => {
                const vault = await brokerContract.getVaultByUUID(mockDlcUUID);
                expect(vault).to.eql([
                    BigNumber.from(0),
                    mockDlcUUID,
                    Status.Ready,
                    BigNumber.from(btcCollateral),
                    BigNumber.from(1),
                    user.address,
                    user.address,
                ]);
            });
        });
    });

    describe('closeVault', async () => {
        beforeEach(async () => {
            const newMintItem = {
                id: 0,
                uri: 'Qme3QxqsJih5psasse4d2FFLFLwaKx7wHXW3Topk3Q8b10/nft',
            };
            await brokerContract
                .connect(user)
                .setupVault(btcCollateral, emergencyRefundTime);
            await brokerContract.setStatusFunded(mockDlcUUID);
            await mockBtcNftContract.safeMint(
                user.address,
                newMintItem.uri,
                brokerContract.address
            );
            await brokerContract.postMintBtcNft(mockDlcUUID, 0);
        });
        it('reverts if sender is not the NFT owner', async () => {
            const vault = await brokerContract.getVaultByUUID(mockDlcUUID);
            await expect(
                brokerContract.closeVault(vault.id)
            ).to.be.revertedWith('Unauthorized');
        });
        it('sets the status to prerepaid if caller is original owner', async () => {
            const vault = await brokerContract.getVaultByUUID(mockDlcUUID);
            const closeTx = await brokerContract
                .connect(user)
                .closeVault(vault.id);
            await closeTx.wait();
            const updatedVault =
                await brokerContract.getVaultByUUID(mockDlcUUID);
            expect(updatedVault).to.eql([
                vault.id,
                mockDlcUUID,
                Status.PreRepaid,
                BigNumber.from(btcCollateral),
                BigNumber.from(0),
                user.address,
                user.address,
            ]);
        });
        it('emits a StatusUpdate event', async () => {
            const vault = await brokerContract.getVaultByUUID(mockDlcUUID);
            const closeTx = await brokerContract
                .connect(user)
                .closeVault(vault.id);
            const txReceipt = await closeTx.wait();
            const event = txReceipt.events.find(
                (ev) => ev.event == 'StatusUpdate'
            );
            expect(event.args).to.eql([
                BigNumber.from(vault.id),
                mockDlcUUID,
                Status.PreRepaid,
            ]);
        });
        it('sets the outcome to 0', async () => {
            const vault = await brokerContract.getVaultByUUID(mockDlcUUID);
            let dlc = await mockDlcManager.getDLC(mockDlcUUID);
            expect(dlc.outcome).to.equal(0);
            const closeTx = await brokerContract
                .connect(user)
                .closeVault(vault.id);
            await closeTx.wait();
            dlc = await mockDlcManager.getDLC(mockDlcUUID);
            expect(dlc.outcome).to.equal(0);
        });

        describe('after NFT transfer', async () => {
            let vault;
            beforeEach(async () => {
                vault = await brokerContract.getVaultByUUID(mockDlcUUID);
                await mockBtcNftContract
                    .connect(user)
                    ['safeTransferFrom(address,address,uint256)'](
                        user.address,
                        liquidator.address,
                        vault.nftId
                    );
            });
            it('sets the status to preLiquidated if caller is not the original owner', async () => {
                const closeTx = await brokerContract
                    .connect(liquidator)
                    .closeVault(vault.id);
                await closeTx.wait();
                const updatedVault =
                    await brokerContract.getVaultByUUID(mockDlcUUID);
                expect(updatedVault).to.eql([
                    vault.id,
                    mockDlcUUID,
                    Status.PreLiquidated,
                    BigNumber.from(btcCollateral),
                    BigNumber.from(0),
                    liquidator.address,
                    user.address,
                ]);
            });
            it('emits a StatusUpdate event', async () => {
                const vault = await brokerContract.getVaultByUUID(mockDlcUUID);
                const closeTx = await brokerContract
                    .connect(liquidator)
                    .closeVault(vault.id);
                const txReceipt = await closeTx.wait();
                const event = txReceipt.events.find(
                    (ev) => ev.event == 'StatusUpdate'
                );
                expect(event.args).to.eql([
                    BigNumber.from(vault.id),
                    mockDlcUUID,
                    Status.PreLiquidated,
                ]);
            });
            it('sets the outcome to 100', async () => {
                let dlc = await mockDlcManager.getDLC(mockDlcUUID);
                expect(dlc.outcome).to.equal(0);
                const closeTx = await brokerContract
                    .connect(liquidator)
                    .closeVault(vault.id);
                await closeTx.wait();
                dlc = await mockDlcManager.getDLC(mockDlcUUID);
                expect(dlc.outcome).to.equal(100);
            });
            it('updates the vaultsPerAddress mapping', async () => {
                let originalOwnerVaultsNumber =
                    await brokerContract.vaultsPerAddress(user.address);
                let liquidatorVaultsNumber =
                    await brokerContract.vaultsPerAddress(liquidator.address);
                expect(originalOwnerVaultsNumber).to.eql(BigNumber.from(1));
                expect(liquidatorVaultsNumber).to.eql(BigNumber.from(0));

                const closeTx = await brokerContract
                    .connect(liquidator)
                    .closeVault(vault.id);
                await closeTx.wait();

                originalOwnerVaultsNumber =
                    await brokerContract.vaultsPerAddress(user.address);
                liquidatorVaultsNumber = await brokerContract.vaultsPerAddress(
                    liquidator.address
                );
                expect(originalOwnerVaultsNumber).to.eql(BigNumber.from(0));
                expect(liquidatorVaultsNumber).to.eql(BigNumber.from(1));
            });
        });
    });
    describe('postCloseDLCHandler', async () => {
        let vault;
        beforeEach(async () => {
            const newMintItem = {
                id: 0,
                uri: 'Qme3QxqsJih5psasse4d2FFLFLwaKx7wHXW3Topk3Q8b10/nft',
            };
            await brokerContract
                .connect(user)
                .setupVault(btcCollateral, emergencyRefundTime);
            await brokerContract.setStatusFunded(mockDlcUUID);
            await mockBtcNftContract.safeMint(
                user.address,
                newMintItem.uri,
                brokerContract.address
            );
            await brokerContract.postMintBtcNft(mockDlcUUID, 0);
            vault = await brokerContract.getVaultByUUID(mockDlcUUID);
        });
        it('reverts if the vault is not in the preRepaid or preLiquidated state', async () => {
            await expect(
                brokerContract
                    .connect(deployer)
                    .postCloseDLCHandler(mockDlcUUID)
            ).to.be.revertedWith('Invalid Vault Status');
        });
        it('sets the status to Repaid if it was preRepaid', async () => {
            const closeTx = await brokerContract
                .connect(user)
                .closeVault(vault.id);
            await closeTx.wait();
            const postCloseTx = await brokerContract
                .connect(deployer)
                .postCloseDLCHandler(mockDlcUUID);
            await postCloseTx.wait();
            const updatedVault =
                await brokerContract.getVaultByUUID(mockDlcUUID);
            expect(updatedVault.status).to.equal(Status.Repaid);
        });
        it('sets the status to Liquidated if it was PreLiquidated', async () => {
            await mockBtcNftContract
                .connect(user)
                ['safeTransferFrom(address,address,uint256)'](
                    user.address,
                    liquidator.address,
                    vault.nftId
                );
            const closeTx = await brokerContract
                .connect(liquidator)
                .closeVault(vault.id);
            await closeTx.wait();
            const postCloseTx = await brokerContract
                .connect(deployer)
                .postCloseDLCHandler(mockDlcUUID);
            await postCloseTx.wait();
            const updatedVault = await brokerContract.getVault(vault.id);
            expect(updatedVault.status).to.equal(Status.Liquidated);
        });
        it('transfers the collateral to the liquidator', async () => {
            await mockBtcNftContract
                .connect(user)
                ['safeTransferFrom(address,address,uint256)'](
                    user.address,
                    liquidator.address,
                    vault.nftId
                );
            const closeTx = await brokerContract
                .connect(liquidator)
                .closeVault(vault.id);
            await closeTx.wait();
            const postCloseTx = await brokerContract
                .connect(deployer)
                .postCloseDLCHandler(mockDlcUUID);
            await postCloseTx.wait();
            expect(await DLCBTCExample.balanceOf(liquidator.address)).to.equal(
                btcCollateral
            );
        });
    });
});
