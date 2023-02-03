const { expect } = require('chai');
const { ethers } = require('hardhat');
const { it } = require('mocha');

describe('BtcNft', () => {

    let btcNftContract;
    let deployer;
    const newMintItem = {
        id: 0,
        uri: 'Qme3QxqsJih5psasse4d2FFLFLwaKx7wHXW3Topk3Q8b14/nft',
    };

    beforeEach(async () => {
        // Setup accounts
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        depositor = accounts[1];
        liquidator = accounts[2];

        const BtcNft = await ethers.getContractFactory('BtcNft', deployer);
        btcNftContract = await BtcNft.deploy();
        await btcNftContract.deployTransaction.wait();
    })

    it('is deployed for the tests', async () => {
        expect(await btcNftContract.deployTransaction).to.exist;
    })

    it('can mint, and should return a correct ID of the newly minted item', async () => {
        // testing the emitted event
        await expect(btcNftContract.safeMint(depositor.address, newMintItem.uri))
            .to.emit(btcNftContract, "NFTMinted")
            .withArgs(newMintItem.id)

        // testing the return value
        const tokenURI = await btcNftContract.tokenURI(newMintItem.id)
        expect(tokenURI).to.equal(`ipfs://${newMintItem.uri}`)
    });

    it('can transfer during liquidation', async () => {
        const tx = await btcNftContract.safeMint(depositor.address, newMintItem.uri)
        const eventsTx = await tx.wait()
        const tokenID = eventsTx.events.find(event => event.event == 'NFTMinted').args._id

        expect(await btcNftContract.ownerOf(tokenID)).to.equal(depositor.address)

        await btcNftContract.connect(depositor)['safeTransferFrom(address,address,uint256)'](depositor.address, liquidator.address, tokenID)

        expect(await btcNftContract.ownerOf(tokenID)).to.equal(liquidator.address)
    })

    describe('when paused', async () => {
        beforeEach(async () => {
            const tx = await btcNftContract.safeMint(depositor.address, newMintItem.uri)
            const eventsTx = await tx.wait()

            await btcNftContract.pause()
        })
        it('can not mint', async () => {
            await expect(btcNftContract.safeMint(depositor.address, 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e')).to.be.revertedWith(
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
