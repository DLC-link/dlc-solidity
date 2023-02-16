const hre = require("hardhat");
// const ethernal = require('hardhat-ethernal');

async function main() {

    // Resetting ethernal workspace
    // await hre.ethernal.resetWorkspace('Local Hardhat');

    // Setup accounts
    const accounts = await hre.ethers.getSigners();
    const deployer = accounts[0];
    const protocol = accounts[1];
    const user = accounts[2];

    const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');
    const mockV3Aggregator = await MockV3Aggregator.deploy(0, 0); //NOTE:
    await mockV3Aggregator.deployTransaction.wait();

    // DLC Manager deployment
    const DLCManager = await hre.ethers.getContractFactory('DLCManager', deployer);
    const dlcManager = await DLCManager.connect(deployer).deploy(deployer.address, mockV3Aggregator.address);
    await dlcManager.deployed();

    // await hre.ethernal.push({
    //     name: 'DLCManager',
    //     address: dlcManager.address
    // });

    // USDC contract deployment
    const USDC = await hre.ethers.getContractFactory('USDStableCoinForDLCs');
    const usdc = await USDC.deploy();
    await usdc.deployed();

    // await hre.ethernal.push({
    //     name: 'USDStableCoinForDLCs',
    //     address: usdc.address
    // });

    // Sample Protocol Contract deployment
    const ProtocolContract = await hre.ethers.getContractFactory('ProtocolContract', protocol);
    const protocolContract = await ProtocolContract.connect(protocol).deploy(dlcManager.address, usdc.address);
    await protocolContract.deployed();

    // await hre.ethernal.push({
    //     name: 'ProtocolContract',
    //     address: protocolContract.address
    // });

    await usdc.mint(protocolContract.address, 100000000);

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
