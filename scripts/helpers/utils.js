require('dotenv').config();
const prompts = require('prompts');
const { loadDeploymentInfo } = require('./deployment-handlers_versioned');
const { ethers } = require('hardhat');

async function promptUser(message) {
    if (process.env.CLI_MODE === 'noninteractive') {
        return true;
    }
    const response = await prompts({
        type: 'confirm',
        name: 'continue',
        message,
        initial: false,
    });
    return response.continue;
}

async function loadContractAddress(requirement, network) {
    const deployment = await loadDeploymentInfo(network, requirement);
    if (!deployment) {
        const shouldContinue = await promptUser(
            `Deployment "${requirement}" not found. Continue?`
        );
        if (!shouldContinue) {
            throw new Error('Deployment aborted by user.');
        }
        return undefined;
    }
    return deployment.contract.address;
}

function getMinimumDelay(networkName) {
    switch (networkName) {
        case 'localhost':
        case 'arbsepolia':
        case 'sepolia':
        case 'basesepolia':
            return 60 * 2; // 2 minutes
        default:
            return 60 * 60 * 24 * 7; // 1 week
    }
}

async function getExpectedContractAddress(deployer, nonce = undefined) {
    // If nonce is not provided, get the current nonce
    if (nonce === undefined) {
        nonce = await deployer.getTransactionCount();
    }

    // Calculate the address using CREATE1 formula
    const addressBytes = ethers.utils.keccak256(
        ethers.utils.RLP.encode([
            deployer.address,
            ethers.BigNumber.from(nonce).toHexString(),
        ])
    );

    // Take the last 40 characters (20 bytes) of the hash
    return ethers.utils.getAddress('0x' + addressBytes.substring(26));
}

module.exports = {
    promptUser,
    loadContractAddress,
    getMinimumDelay,
    getExpectedContractAddress,
};
