require('dotenv').config();
const prompts = require('prompts');
const hardhat = require('hardhat');
const getContractConfigs = require('../99_contract-configs');
const dlcAdminSafesConfigs = require('../helpers/dlc-admin-safes');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('../helpers/deployment-handlers_versioned');
const { loadContractAddress } = require('../helpers/utils');

prompts.inject([true, true, true, true, true, true]);

async function main() {
    const network = hardhat.network.name;
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const dlcAdminSafes = {
        medium: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        critical: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    };

    console.log(network, dlcAdminSafes);

    if (!dlcAdminSafes) throw new Error('DLC Admin Safe address not found.');

    const contractConfigs = getContractConfigs(
        {
            deployer,
            dlcAdminSafes,
        },
        process.env.BTC_FEE_RECIPIENT
    );

    await hardhat.run('compile');

    for (const contractConfig of contractConfigs) {
        const requirements = contractConfig.requirements;
        const reqs = {};
        for (const requirement of requirements) {
            reqs[requirement] = await loadContractAddress(requirement, network);
        }
        await contractConfig.deploy(reqs);
    }

    console.log('Deployment complete');
}

// make sure we catch all errors
main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
