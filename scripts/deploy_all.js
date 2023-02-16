const fs = require('fs/promises')
const { F_OK } = require('fs')
const inquirer = require('inquirer')

async function main() {
    const hardhat = require('hardhat')
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const protocol = accounts[1];
    const network = hardhat.network.name

    // DLC Manager deployment
    console.log(`deploying contract DLCManager to network "${network}"...`)
    const DLCManager = await hardhat.ethers.getContractFactory('DLCManager');
    const dlcManager = await DLCManager.deploy(deployer.address, '0xA39434A63A52E749F02807ae27335515BA4b07F7'); // Chainlink price feed goerli
    await dlcManager.deployed();
    console.log(`deployed contract DLCManager to ${dlcManager.address} (network: ${network})`);
    saveDeploymentInfo(deploymentInfo(hardhat, dlcManager, 'DlcManager'))

    // BTCNFT deployment
    console.log(`deploying contract for nft BtcNft (DLC) to network "${network}"...`)
    const BtcNft = await hardhat.ethers.getContractFactory("BtcNft")
    const btcNft = await BtcNft.deploy()
    await btcNft.deployed()
    console.log(`deployed contract for nft BtcNft (DLC) to ${btcNft.address} (network: ${network})`);
    saveDeploymentInfo(deploymentInfo(hardhat, btcNft, 'BtcNft'))

    // DlcBroker deployment
    console.log(`deploying contract DlcBroker to network "${network}"...`)
    const DlcBroker = await hardhat.ethers.getContractFactory("DlcBroker")
    const dlcBroker = await DlcBroker.deploy(dlcManager.address, btcNft.address)
    await dlcBroker.deployed()
    console.log(`deployed contract DlcBroker to ${dlcBroker.address} (network: ${network})`);
    saveDeploymentInfo(deploymentInfo(hardhat, dlcBroker, 'DlcBroker'))

    // USDC contract deployment
    console.log(`deploying contract for token USDStableCoinForDLCs (USDC) to network "${network}"...`)
    const USDC = await hardhat.ethers.getContractFactory('USDStableCoinForDLCs');
    const usdc = await USDC.deploy();
    await usdc.deployed();
    console.log(`deployed contract for token USDStableCoinForDLCs (USDC) to ${usdc.address} (network: ${network})`);
    saveDeploymentInfo(deploymentInfo(hardhat, usdc, 'USDC'))

    // Sample Protocol Contract deployment
    console.log(`deploying contract ProtocolContract to network "${network}"...`)
    const ProtocolContract = await hardhat.ethers.getContractFactory('ProtocolContract', protocol);
    const protocolContract = await ProtocolContract.deploy(dlcManager.address, usdc.address);
    await protocolContract.deployed();
    console.log(`deployed contract ProtocolContract to ${protocolContract.address} (network: ${network})`);
    saveDeploymentInfo(deploymentInfo(hardhat, protocolContract, 'ProtocolContract'))

    await usdc.mint(protocolContract.address, 100000000);
}

function deploymentInfo(hardhat, contract, contractName) {
    const deployInfo = {
        network: hardhat.network.name,
        contract: {
            name: contractName,
            address: contract.address,
            signerAddress: contract.signer.address,
            abi: contract.interface.format(),
        },
    }
    console.log(deployInfo)
    return deployInfo
}

async function saveDeploymentInfo(info, filename = undefined) {
    if (!filename) {
        filename = `deploymentFiles/${info.network}/${info.contract.name}.json`
    }
    console.log(`Writing deployment info to ${filename}`)
    const content = JSON.stringify(info, null, 2)
    await fs.writeFile(filename, content, { encoding: 'utf-8' })
    return true
}

function validateDeploymentInfo(deployInfo) {
    const { contract } = deployInfo
    if (!contract) {
        throw new Error('required field "contract" not found')
    }
    const required = arg => {
        if (!deployInfo.contract.hasOwnProperty(arg)) {
            throw new Error(`required field "contract.${arg}" not found`)
        }
    }

    required('name')
    required('address')
    required('abi')
}

async function fileExists(path) {
    try {
        await fs.access(path, F_OK)
        return true
    } catch (e) {
        return false
    }
}

async function confirmOverwrite(filename) {
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'overwrite',
            message: `File ${filename} exists. Overwrite it?`,
            default: false,
        }
    ])
    return answers.overwrite
}

// module.exports = {
//     deployContract,
//     loadDeploymentInfo,
//     saveDeploymentInfo,
// }

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
