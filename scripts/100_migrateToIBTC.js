const hardhat = require('hardhat');
const { ethers, upgrades } = require('hardhat');
const {
    loadContractAddress,
    getExpectedContractAddress,
    promptUser,
    getMinimumDelay,
} = require('./helpers/utils');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const dlcAdminSafesConfigs = require('./helpers/dlc-admin-safes');
const chalk = require('chalk');
const safeContractProposal = require('./helpers/safe-api-service');

const main = async () => {
    const network = hardhat.network.name;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const dlcAdminSafes = dlcAdminSafesConfigs[network];
    const proxyAdmin = await upgrades.admin.getInstance();
    const proxyAdminOwner = await proxyAdmin.owner();
    console.log('ProxyAdmin owner:', proxyAdminOwner);

    const tokenProxyAddress = await loadContractAddress('DLCBTC', network);

    const newImplementation = await ethers.getContractFactory('IBTC');

    if (proxyAdminOwner == deployer.address) {
        const ibtc = await upgrades.upgradeProxy(
            tokenProxyAddress,
            newImplementation
        );
        await ibtc.reinitializeEIP712();
        await saveDeploymentInfo(deploymentInfo(network, ibtc, 'IBTC'));

        await hardhat.run('verify:verify', {
            address: ibtc.address,
            constructorArguments: [],
        });
    } else {
        console.log('New implementation:', newImplementation);
        console.log(
            'Expected contract address: ',
            await getExpectedContractAddress(deployer)
        );
        if ((await promptUser('Are you sure you want to continue?')) === false)
            return;
        // We need to propose the upgrade through the SAFE & timelock
        const newImplementationAddress = await upgrades.prepareUpgrade(
            tokenProxyAddress,
            newImplementation,
            { timeout: 240 }
        );
        console.log('New implementation address', newImplementationAddress);

        console.log('Verifying new implementation...');
        await hardhat.run('verify:verify', {
            address: newImplementationAddress,
        });
        console.log('New implementation verified.');

        // we prepare the tx to the ProxyAdmin to upgrade the contract
        // NOTE: we have to store this data for the actual execution
        const upgradeTx = await proxyAdmin.populateTransaction.upgrade(
            tokenProxyAddress,
            newImplementationAddress
        );
        console.log('tokenProxyAddress', tokenProxyAddress);
        console.log('newImplementationAddress', newImplementationAddress);
        console.log('proxyAdmin.address', proxyAdmin.address);
        console.log(
            chalk.bgYellowBright('upgradeTx: (Store this!)'),
            upgradeTx
        );

        // Fetching the TimelockController contract
        const timeLockContractDeployInfo = await loadDeploymentInfo(
            network,
            'TimelockController'
        );
        const timelockContract = new hardhat.ethers.Contract(
            timeLockContractDeployInfo.contract.address,
            timeLockContractDeployInfo.contract.abi,
            deployer
        );

        // Preparing the Multisig request to the TimelockController
        const minimumDelay = getMinimumDelay(network);
        const tlRequestParams = [
            proxyAdmin.address,
            0,
            upgradeTx.data,
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            minimumDelay,
        ];
        const timelockContractTxRequest = await timelockContract
            .connect(deployer)
            .populateTransaction['schedule'](...tlRequestParams);
        console.log('timelockContractTxRequest', timelockContractTxRequest);

        // Proposing the upgrade through the SAFE
        await safeContractProposal(
            timelockContractTxRequest,
            deployer,
            dlcAdminSafes.critical
        );

        const implObject = await hardhat.ethers.getContractAt(
            'IBTC',
            // @ts-ignore
            newImplementationAddress
        );
        const deploymentInfoToSave = deploymentInfo(
            network,
            { ...implObject, address: tokenProxyAddress },
            'IBTC',
            upgradeTx.data
        );
        await saveDeploymentInfo(
            deploymentInfoToSave,
            `deploymentFiles/${network}/${'IBTC'}.proposed.json`
        );
    }
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
