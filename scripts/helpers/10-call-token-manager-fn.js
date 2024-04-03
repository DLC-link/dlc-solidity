const hardhat = require('hardhat');

const { loadDeploymentInfo } = require('./deployment-handlers_versioned');
const safeContractProposal = require('./safe-api-service');

async function callTokenManagerFunction(functionName, args, version) {
    const accounts = await hardhat.ethers.getSigners();
    // NOTE: should be key_for_safe
    const admin = accounts[0];

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
        (await tokenManager.hasRole(
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
        const txRequest = await contract
            .connect(admin)
            .populateTransaction[functionName](...args);
        await safeContractProposal(txRequest, admin);
    }
}

module.exports = { callTokenManagerFunction };
