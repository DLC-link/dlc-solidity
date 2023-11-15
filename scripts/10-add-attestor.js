const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

// attestor URL MUST start with http:// or https://
module.exports = async function addAttestor(attestor, version) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[3] || accounts[0];

    const attestorManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'AttestorManager',
        version
    );

    const attestorManager = new hardhat.ethers.Contract(
        attestorManagerDeployInfo.contract.address,
        attestorManagerDeployInfo.contract.abi,
        admin
    );

    if (await attestorManager.isAttestor(attestor)) {
        console.log(`Attestor ${attestor} already added.`);
        return;
    }

    if (
        hardhat.network.name === 'localhost' ||
        (await attestorManager.hasRole(
            hardhat.ethers.utils.id('ADMIN_ROLE'),
            admin.address
        ))
    ) {
        console.log(`Adding attestor ${attestor}`);
        const tx = await attestorManager.connect(admin).addAttestor(attestor);
        await tx.wait();
        console.log(tx);
    } else {
        console.log(`Requesting adding attestor ${attestor}`);
        const txRequest =
            await attestorManager.populateTransaction.addAttestor(attestor);
        await safeContractProposal(txRequest, admin);
        return;
    }
};
