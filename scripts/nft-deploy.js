const fs = require('fs/promises')
const { F_OK } = require('fs')

const inquirer = require('inquirer')
const { BigNumber } = require('ethers')
const config = require('getconfig')

const CONTRACT_NAME = "BtcNft"
const CONTRACT_SYMBOL = "DLC"

async function main() {
    const info = await deployContract(CONTRACT_NAME, CONTRACT_SYMBOL)
    await saveDeploymentInfo(info, config.deploymentConfigFile)
}

async function deployContract(name, symbol) {
    const hardhat = require('hardhat')
    const network = hardhat.network.name

    console.log(`deploying contract for token ${name} (${symbol}) to network "${network}"...`)
    const BtcNft = await hardhat.ethers.getContractFactory(CONTRACT_NAME)
    const btcNft = await BtcNft.deploy()

    await btcNft.deployed()
    console.log(`deployed contract for token ${name} (${symbol}) to ${btcNft.address} (network: ${network})`);

    return deploymentInfo(hardhat, btcNft)
}

function deploymentInfo(hardhat, btcNft) {
    return {
        network: hardhat.network.name,
        contract: {
            name: CONTRACT_NAME,
            address: btcNft.address,
            signerAddress: btcNft.signer.address,
            abi: btcNft.interface.format(),
        },
    }
}

async function saveDeploymentInfo(info, filename = undefined) {
    if (!filename) {
        filename = config.deploymentConfigFile || 'btcNft-deployment.json'
    }
    const exists = await fileExists(filename)
    if (exists) {
        const overwrite = await confirmOverwrite(filename)
        if (!overwrite) {
            return false
        }
    }

    console.log(`Writing deployment info to ${filename}`)
    const content = JSON.stringify(info, null, 2)
    await fs.writeFile(filename, content, { encoding: 'utf-8' })
    return true
}

async function loadDeploymentInfo() {
    let { deploymentConfigFile } = config
    if (!deploymentConfigFile) {
        console.log('no deploymentConfigFile field found in btcNft config. attempting to read from default path "./btcNft-deployment.json"')
        deploymentConfigFile = 'btcNft-deployment.json'
    }
    const content = await fs.readFile(deploymentConfigFile, { encoding: 'utf8' })
    deployInfo = JSON.parse(content)
    try {
        validateDeploymentInfo(deployInfo)
    } catch (e) {
        throw new Error(`error reading deploy info from ${deploymentConfigFile}: ${e.message}`)
    }
    return deployInfo
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
