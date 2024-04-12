const hardhat = require('hardhat');
const { promptUser } = require('./utils');
const { loadDeploymentInfo } = require('./deployment-handlers_versioned');
const safeContractProposal = require('./safe-api-service');
const dlcAdminSafes = require('./dlc-admin-safes');
const prompts = require('prompts');

async function callTokenManagerFunction(functionName, args, version) {
    const network = hardhat.network.name;
    console.log('Network', network);
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const keyForSafe = accounts[3];
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
        'TokenManager',
        version
    );
    const contract = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        admin
    );

    console.log('calling function', functionName, 'with args', args, '...');
    if (
        hardhat.network.name === 'localhost' ||
        (await contract.hasRole(
            hardhat.ethers.utils.id('DLC_ADMIN_ROLE'),
            admin.address
        ))
    ) {
        console.log('admin has DLC_ADMIN_ROLE, calling function...');
        const tx = await contract.connect(admin)[functionName](...args);
        const receipt = await tx.wait();
        console.log(receipt);
    } else {
        console.log(
            'admin does not have DLC_ADMIN_ROLE, submitting multisig request...'
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

module.exports = { callTokenManagerFunction };
