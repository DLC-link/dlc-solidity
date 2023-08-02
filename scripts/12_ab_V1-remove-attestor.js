const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

// attestor URL MUST start with http:// or https://
module.exports = async function removeAttestor(attestor) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];

    const attestorManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'AttestorManager',
        'v1'
    );

    const attestorManager = new hardhat.ethers.Contract(
        attestorManagerDeployInfo.contract.address,
        attestorManagerDeployInfo.contract.abi,
        admin
    );

    if (await attestorManager.isAttestor(attestor)) {
        console.log(`Removing attestor ${attestor}`);
        const tx = await attestorManager
            .connect(admin)
            .removeAttestor(attestor);
        const rec = await tx.wait();
        console.log(rec);
    } else {
        console.log(`Attestor ${attestor} is not registered`);
    }
};
