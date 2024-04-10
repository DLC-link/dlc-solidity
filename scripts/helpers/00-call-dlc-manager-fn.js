const hardhat = require('hardhat');
const chalk = require('chalk');

const { loadDeploymentInfo } = require('./deployment-handlers_versioned');
const safeContractProposal = require('./safe-api-service');

async function callManagerContractFunction(functionName, args, version) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    console.log('admin address:', admin.address);

    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DLCManager',
        version
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
                'admin does not have DEFAULT_ADMIN_ROLE, submitting multisig request...'
            )
        );
        const txRequest = await contract
            .connect(admin)
            .populateTransaction[functionName](...args);
        await safeContractProposal(txRequest, admin);
    }
}

module.exports = { callManagerContractFunction };
