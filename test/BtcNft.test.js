const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('BtcNft', () => {

    let btcNftContract;
    let deployer, user;

    beforeEach(async () => {
        // Setup accounts
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        user = accounts[1];

        const BtcNft = await ethers.getContractFactory('BtcNft', deployer);
        btcNftContract = await BtcNft.deploy();
        await btcNftContract.deployTransaction.wait();
    })

    it('is deployed for the tests', async () => {
        expect(await btcNftContract.deployTransaction).to.exist;
    })

    it('Should return a correct ID of the newly minted item', async () => {
        const newMintItem = {
            id: 0,
            uri: 'Qme3QxqsJih5psasse4d2FFLFLwaKx7wHXW3Topk3Q8b14/nft',
        };

        // testing the emitted event
        await expect(btcNftContract.safeMint(user.address, newMintItem.uri))
            .to.emit(btcNftContract, "NFTMinted")
            .withArgs(newMintItem.id);

        // testing the getter value
        const tokenURI = await btcNftContract.tokenURI(newMintItem.id);
        expect(tokenURI).to.equal(`ipfs://${newMintItem.uri}`);
    });

    describe('when paused', async () => {
        beforeEach(async () => {
            await btcNftContract.pause()
        })
        it('can not mint', async () => {
            await expect(btcNftContract.safeMint(user.address, 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e')).to.be.revertedWith(
                "Pausable: paused"
            );
        })
    })

})
