require('dotenv').config();
const prompts = require('prompts');
const hardhat = require('hardhat');
const getContractConfigs = require('../99_contract-configs');
const dlcAdminSafesConfigs = require('../helpers/dlc-admin-safes');
const { loadContractAddress } = require('../helpers/utils');

prompts.inject([true, true, true, true, true, true]);

async function main() {
    const network = hardhat.network.name;
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const dlcAdminSafes = dlcAdminSafesConfigs[network];

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
