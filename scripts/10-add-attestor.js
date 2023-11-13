const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

// attestor URL MUST start with http:// or https://
module.exports = async function addAttestor(attestor, version) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];

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

    if (!(await attestorManager.isAttestor(attestor))) {
        console.log(`Adding attestor ${attestor}`);
        await attestorManager.connect(admin).addAttestor(attestor);
    } else {
        console.log(`Attestor ${attestor} already added`);
    }
};
