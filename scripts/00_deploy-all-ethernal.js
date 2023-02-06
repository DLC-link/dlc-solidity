const hre = require("hardhat");
const ethernal = require('hardhat-ethernal');

async function main() {

  // Resetting ethernal workspace
  await hre.ethernal.resetWorkspace('Local Hardhat');

  // Setup accounts
  const accounts = await hre.ethers.getSigners();
  const deployer = accounts[0];
  const protocol = accounts[1];
  const user = accounts[2];

  // DLC Manager deployment
  const DLCManager = await hre.ethers.getContractFactory('DLCManager');
  const dlcManager = await DLCManager.deploy();
  await dlcManager.deployed();

  await hre.ethernal.push({
    name: 'DLCManager',
    address: dlcManager.address
  });

  // USDC contract deployment
  const USDC = await hre.ethers.getContractFactory('USDStableCoinForDLCs');
  const usdc = await USDC.deploy();
  await usdc.deployed();

  await hre.ethernal.push({
    name: 'USDStableCoinForDLCs',
    address: usdc.address
  });

  // Sample Protocol Contract deployment
  const ProtocolContract = await hre.ethers.getContractFactory('ProtocolContract', protocol);
  const protocolContract = await ProtocolContract.deploy(usdc.address);
  await protocolContract.deployed();

  await hre.ethernal.push({
    name: 'ProtocolContract',
    address: protocolContract.address
  });

  await usdc.mint(protocolContract.address, 100000000);

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
