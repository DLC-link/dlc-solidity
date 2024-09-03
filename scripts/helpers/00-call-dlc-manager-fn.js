const hardhat = require('hardhat');
const chalk = require('chalk');

const { loadDeploymentInfo } = require('./deployment-handlers_versioned');
const safeContractProposal = require('./safe-api-service');
const { promptUser } = require('./utils');
const dlcAdminSafes = require('./dlc-admin-safes');
const prompts = require('prompts');

async function callManagerContractFunction(functionName, args) {
    const network = process.env.NETWORK_NAME ?? hardhat.network.name;
    console.log('Network', network);
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    let keyForSafe = admin;
    const safeAddresses = dlcAdminSafes[network];

    console.log('admin address:', admin.address);
    console.log('keyForSafe address:', keyForSafe.address);
    console.log('safeAddresses:', safeAddresses);
    console.log('functionName:', functionName);

    const deployInfo = await loadDeploymentInfo(network, 'DLCManager');
    const contract = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        admin
    );

    console.log('calling function', functionName, 'with args', args);

    if (!(await promptUser('Are you sure you want to proceed? (y/n)'))) {
        console.log('Aborted by user.');
        return;
    }

    if (
        hardhat.network.name === 'localhost' ||
        (await contract.hasRole(
            hardhat.ethers.utils.id('DLC_ADMIN_ROLE'),
            admin.address
        )) ||
        (await contract.defaultAdmin()) === admin.address
    ) {
        console.log(
            chalk.bgYellow(
                'admin has DLC_ADMIN_ROLE or is DEFAULT_ADMIN, calling function...'
            )
        );

        const tx = await contract.connect(admin)[functionName](...args);

        const receipt = await tx.wait();
        console.log(receipt);
    } else {
        console.log(
            chalk.bgYellow(
                'admin does not have DLC_ADMIN_ROLE or is DEFAULT_ADMIN, preparing multisig request...'
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
