const hardhat = require('hardhat');
const { promptUser, loadContractAddress } = require('./helpers/utils');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const proposeSafeTx = require('./helpers/safe-api-service');

async function main() {
    await hardhat.run('compile');
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const network = hardhat.network.name;

    const multisig = '0xebDC2027D3ee493B49553Befc1200e1cce9e2E08'; // basesep test

    const contractName = 'DLCManager';

    const proxyContract = await loadContractAddress(contractName, network);

    const newImplementation =
        await hardhat.ethers.getContractFactory(contractName);
    console.log('Preparing upgrade...');
    const newImplementationAddress = await hardhat.upgrades.prepareUpgrade(
        proxyContract,
        newImplementation
    );

    console.log('Verifying new implementation...');
    await hardhat.run('verify:verify', {
        address: newImplementationAddress,
    });
    console.log('New implementation verified.');

    const proxyAdmin = await hardhat.upgrades.admin.getInstance();
    const upgradeTx = await proxyAdmin.populateTransaction.upgrade(
        proxyContract,
        newImplementationAddress
    );
    console.log('proxyContract', proxyContract);
    console.log('newImplementationAddress', newImplementationAddress);
    console.log('proxyAdmin.address', proxyAdmin.address);
    console.log('upgradeTx', upgradeTx);

    // I want to call the TL contract to schedule the upgrade
    const deployInfo = await loadDeploymentInfo(network, 'TimelockController');
    const timelockContract = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        deployer
    );
    const timelockContractTxRequest = await timelockContract
        .connect(deployer)
        .populateTransaction[
            'schedule'
        ](proxyAdmin.address, 0, upgradeTx.data, '0x0000000000000000000000000000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000000000000000000000000000', 120);
    console.log('timelockContractTxRequest', timelockContractTxRequest);

    await proposeSafeTx(timelockContractTxRequest, deployer, multisig);

    // After the delay period...
    // const timelockContractTxRequestToExecute = await timelockContract
    //     .connect(deployer)
    //     .populateTransaction[
    //         'execute'
    //     ](proxyAdmin.address, 0, '0x99a88ec4000000000000000000000000050c24dbf1eec17babe5fc585f06116a259cc77a0000000000000000000000008f8625c2a9bc9770bcfe06aae1fcdd479fa60b83', '0x0000000000000000000000000000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000000000000000000000000000');
    // console.log(
    //     'timelockContractTxRequestToExecute',
    //     timelockContractTxRequestToExecute
    // );

    // await proposeSafeTx(timelockContractTxRequestToExecute, deployer, multisig);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
