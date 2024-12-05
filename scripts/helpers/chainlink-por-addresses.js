const { ethers } = require('hardhat');

async function deployAndGetMockAggregatorAddress() {
    console.log('Deploying mock aggregator...');
    const MockAggregator = await ethers.getContractFactory('MockV3Aggregator');
    const mockAggregator = await MockAggregator.deploy(8, 4049610000); // 40.4961
    await mockAggregator.deployed();
    console.log(`Mock aggregator deployed at ${mockAggregator.address}`);
    return mockAggregator.address;
}

module.exports = async function getPoRAddress(network) {
    switch (network) {
        case 'mainnet':
            return '';
        case 'sepolia':
            return '';
        case 'arbitrum':
            return '0x47A2fBEb46553F01E7133686Fb1b5349d4823a0C';
        case 'arbsepolia':
            return '';
        case 'base':
            return '0x30A76F4E688Cf52f4A06D7AAd987A7037f3Ae6f7';
        case 'basesepolia':
            return '';
        case 'localhost':
            return await deployAndGetMockAggregatorAddress();
        default:
            throw new Error('Invalid network for Chainlink PoR address');
    }
};
