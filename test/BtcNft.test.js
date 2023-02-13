const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const { it } = require('mocha');

describe('BtcNft', () => {

    let btcNftContract;
    let deployer;
    const newMintItem = {
        id: 0,
        uri: 'Qme3QxqsJih5psasse4d2FFLFLwaKx7wHXW3Topk3Q8b10/nft',
    };
    const newMintItem2 = {
        id: 1,
        uri: 'Qme3QxqsJih5psasse4d2FFLFLwaKx7wHXW3Topk3Q8b11/nft',
    };
    const newMintItem3 = {
        id: 2,
        uri: 'Qme3QxqsJih5psasse4d2FFLFLwaKx7wHXW3Topk3Q8b12/nft',
    };

    beforeEach(async () => {
        // Setup accounts
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        depositor = accounts[1];
        depositor2 = accounts[2];
        liquidator = accounts[3];
        broker = accounts[4];

        const BtcNft = await ethers.getContractFactory('BtcNft', deployer);
        btcNftContract = await BtcNft.deploy();
        await btcNftContract.deployTransaction.wait();
    })

    it('is deployed for the tests', async () => {
        expect(await btcNftContract.deployTransaction).to.exist;
    })

    it('can mint, and should return a correct ID of the newly minted item', async () => {
        // testing the emitted event
        await expect(btcNftContract.safeMint(depositor.address, newMintItem.uri, broker.address))
            .to.emit(btcNftContract, "NFTMinted")
            .withArgs(newMintItem.id)

        // testing the return value
        const tokenURI = await btcNftContract.tokenURI(newMintItem.id)
        expect(tokenURI).to.equal(`ipfs://${newMintItem.uri}`)
    })

    it('can transfer during liquidation', async () => {
        const tx = await btcNftContract.safeMint(depositor.address, newMintItem.uri, broker.address)
        const eventsTx = await tx.wait()
        const tokenID = eventsTx.events.find(event => event.event == 'NFTMinted').args._id

        expect(await btcNftContract.ownerOf(tokenID)).to.equal(depositor.address)

        await btcNftContract.connect(depositor)['safeTransferFrom(address,address,uint256)'](depositor.address, liquidator.address, tokenID)

        expect(await btcNftContract.ownerOf(tokenID)).to.equal(liquidator.address)
    })

    it('can mint, burn, and mint again, and the IDs should be right', async () => {
        // testing the emitted event
        await expect(btcNftContract.safeMint(depositor.address, newMintItem.uri, broker.address))
            .to.emit(btcNftContract, "NFTMinted")
            .withArgs(newMintItem.id)

        // testing the return value
        const tokenURI = await btcNftContract.tokenURI(newMintItem.id)
        expect(tokenURI).to.equal(`ipfs://${newMintItem.uri}`)

        await (btcNftContract.connect(depositor).burn(newMintItem.id))

        await expect(btcNftContract.safeMint(depositor.address, newMintItem.uri, broker.address))
            .to.emit(btcNftContract, "NFTMinted")
            .withArgs(0)

        console.log(await btcNftContract.tokenURI(0))

        // testing the return value
        const tokenURI2 = await btcNftContract.tokenURI(newMintItem.id)
        expect(tokenURI2).to.equal(`ipfs://${newMintItem.uri}`)
    })

    describe('fetchNFTs', async () => {
        describe('when the owner is always the depositor', async () => {
            it('should return a list of DLC-NFT objects', async () => {
                const tx = await btcNftContract.safeMint(depositor.address, newMintItem.uri, broker.address)
                const tx2 = await btcNftContract.safeMint(depositor.address, newMintItem2.uri, broker.address)
                const tx3 = await btcNftContract.safeMint(depositor2.address, newMintItem3.uri, broker.address)

                expect(await btcNftContract.balanceOf(depositor.address)).to.equal(2);

                const NFTs = await btcNftContract.getDLCNFTsByOwner(depositor.address);
                // [NFT ID, ipfs uri, original depositor address]
                expect(NFTs).to.eql([
                    [BigNumber.from(newMintItem.id), `ipfs://${newMintItem.uri}`, depositor.address, broker.address],
                    [BigNumber.from(newMintItem2.id), `ipfs://${newMintItem2.uri}`, depositor.address, broker.address],
                ]);
            })
        })

        describe('when the owner isnt always the depositor bc it was transfered', async () => {
            it('should return a list of DLC-NFT objects', async () => {
                const tx = await btcNftContract.safeMint(depositor.address, newMintItem.uri, broker.address)
                const tx2 = await btcNftContract.safeMint(depositor2.address, newMintItem2.uri, broker.address)
                const tx3 = await btcNftContract.safeMint(depositor2.address, newMintItem3.uri, broker.address)

                await btcNftContract.connect(depositor)['safeTransferFrom(address,address,uint256)'](depositor.address, liquidator.address, newMintItem.id)
                await btcNftContract.connect(depositor2)['safeTransferFrom(address,address,uint256)'](depositor2.address, liquidator.address, newMintItem2.id)

                expect(await btcNftContract.balanceOf(liquidator.address)).to.equal(2);

                const NFTs = await btcNftContract.getDLCNFTsByOwner(liquidator.address);
                // [NFT ID, ipfs uri, original depositor address]
                expect(NFTs).to.eql([
                    [BigNumber.from(newMintItem.id), `ipfs://${newMintItem.uri}`, depositor.address, broker.address],
                    [BigNumber.from(newMintItem2.id), `ipfs://${newMintItem2.uri}`, depositor2.address, broker.address]
                ]);
            })
        })
    })

    describe('when paused', async () => {
        beforeEach(async () => {
            const tx = await btcNftContract.safeMint(depositor.address, newMintItem.uri, broker.address)
            const eventsTx = await tx.wait()

            await btcNftContract.pause()
        })
        it('can not mint', async () => {
            await expect(btcNftContract.safeMint(depositor.address, 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e', broker.address)).to.be.revertedWith(
                "Pausable: paused"
            );
        })
        it('can not transfer', async () => {
            await expect(btcNftContract.connect(depositor)['safeTransferFrom(address,address,uint256)'](depositor.address, liquidator.address, newMintItem.id)).to.be.revertedWith(
                "Pausable: paused"
            );
        })
    })

})
