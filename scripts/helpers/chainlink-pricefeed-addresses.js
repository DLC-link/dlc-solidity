const { ethers } = require('hardhat');

async function deployAndGetMockAggregatorAddress() {
    console.log('deploying mock aggregator');
    const MockAggregator = await ethers.getContractFactory('MockV3Aggregator');
    const mockAggregator = await MockAggregator.deploy(8, 2612647400000);
    await mockAggregator.deployed();
    return mockAggregator.address;
}

module.exports = async function getChainLinkBTCPriceFeedAddress(network) {
    switch (network) {
        case 'mainnet':
            return '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c';
        case 'sepolia':
            return '0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43';
        case 'goerli':
            return '0xA39434A63A52E749F02807ae27335515BA4b07F7';
        case 'localhost':
        case 'bobtest':
            return await deployAndGetMockAggregatorAddress();
        default:
            throw new Error('Invalid network');
    }
};
