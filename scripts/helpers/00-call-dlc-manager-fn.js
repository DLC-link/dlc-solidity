const hardhat = require('hardhat');
const chalk = require('chalk');

const { loadDeploymentInfo } = require('./deployment-handlers_versioned');
const safeContractProposal = require('./safe-api-service');
const { promptUser } = require('./utils');
const dlcAdminSafes = require('./dlc-admin-safes');
const prompts = require('prompts');

async function callManagerContractFunction(functionName, args) {
    const network = hardhat.network.name;
    console.log('Network', network);
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    let keyForSafe = accounts[3];
    if (!keyForSafe) keyForSafe = admin;
    const safeAddresses = dlcAdminSafes[network];

    console.log('admin address:', admin.address);
    console.log('keyForSafe address:', keyForSafe.address);
    console.log('safeAddresses:', safeAddresses);
    console.log('functionName:', functionName);

    if (!(await promptUser('Are you sure you want to proceed? (y/n)'))) {
        console.log('Aborted by user.');
        return;
    }

    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DLCManager'
    );
    const contract = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        admin
    );

    console.log('calling function', functionName, 'with args', args);
    if (
        hardhat.network.name === 'localhost' ||
        admin.address == (await contract.defaultAdmin())
    ) {
        console.log(
            chalk.bgYellow('admin has DEFAULT_ADMIN_ROLE, calling function...')
        );

        const tx = await contract.connect(admin)[functionName](...args);

        const receipt = await tx.wait();
        console.log(receipt);
    } else {
        console.log(
            chalk.bgYellow(
                'admin does not have DEFAULT_ADMIN_ROLE, preparing multisig request...'
            )
        );
        const response = await prompts({
            type: 'select',
            name: 'safeAccount',
            message: 'Select a SAFE Account',
            choices: [
                {
                    title: `Medium: ${safeAddresses.medium}`,
                    value: safeAddresses.medium,
                },
                {
                    title: `Critical: ${safeAddresses.critical}`,
                    value: safeAddresses.critical,
                },
            ],
        });
        const txRequest = await contract
            .connect(keyForSafe)
            .populateTransaction[functionName](...args);
        await safeContractProposal(txRequest, keyForSafe, response.safeAccount);
    }
}

module.exports = { callManagerContractFunction };
