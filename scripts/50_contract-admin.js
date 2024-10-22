require('dotenv').config();
const hardhat = require('hardhat');
const fs = require('fs/promises');

const prompts = require('prompts');
const chalk = require('chalk');
const dlcAdminSafesConfigs = require('./helpers/dlc-admin-safes');
const getContractConfigs = require('./99_contract-configs');
const {
    promptUser,
    loadContractAddress,
    getMinimumDelay,
} = require('./helpers/utils');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');

module.exports = async function contractAdmin() {
    const network = hardhat.network.name;
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const dlcAdminSafes = dlcAdminSafesConfigs[network];
    if (!dlcAdminSafes) throw new Error('DLC Admin Safe address not found.');

    const contractConfigs = getContractConfigs({
        networkName: network,
        deployer,
        dlcAdminSafes,
    });

    console.log('AdminSafes:', dlcAdminSafes);
    let response = await promptUser(
        `You are about to interact with network: ${network}.\nDeployer account: ${deployer.address}\nContinue?`
    );
    if (!response) {
        return;
    }

    let action = await prompts({
        type: 'select',
        name: 'value',
        message: 'What would you like to do?',
        choices: [
            {
                title: 'Deploy Contracts',
                description: 'Deploy contracts',
                value: 'deploy',
            },
            { title: 'Verify Contract On Etherscan', value: 'verify' },
            {
                title: 'Validate an Upgrade',
                value: 'validate-upgrade',
                description:
                    'Validate a potential contract upgrade without performing any deployments.',
            },
            {
                title: 'Upgrade Proxy',
                value: 'upgrade',
                description:
                    'Upgrade a contract. Either directly, or through a SAFE proposal through a TimelockController',
            },
            {
                title: 'Execute Upgrade',
                value: 'execute-upgrade',
                description: 'Execute an upgrade after the delay period',
            },
            {
                title: 'Transfer DLCBTC Ownership',
                value: 'transfer-dlcbtc',
                description: 'Transfer ownership of DLCBTC after deployment',
            },
            {
                title: 'Begin Transfer DEFAULT_ADMIN_ROLE',
                value: 'transfer-admin',
                description:
                    'Begin the transfer of DEFAULT_ADMIN_ROLE on the DLCManager contract',
            },
            {
                title: 'Transfer ProxyAdmin Ownership',
                value: 'transfer-proxyadmin',
                description: 'Transfer ownership of the ProxyAdmin contract',
            },
        ],
        initial: 0,
    });

    switch (action.value) {
        case 'deploy': {
            const contractSelectPrompt = await prompts({
                type: 'multiselect',
                name: 'contracts',
                message: `Select contracts to deploy to ${network}`,
                choices: contractConfigs.map((config) => ({
                    title: `${config.name} | deployer: ${config.deployer}`,
                    value: config.name,
                })),
                min: 0,
                max: 12,
            });
            if (!contractSelectPrompt.contracts.length) {
                console.log('No contracts selected. Deployment aborted.');
                return;
            }
            await hardhat.run('compile');
            const deployedContracts = {};

            for (const contractName of contractSelectPrompt.contracts) {
                const contractConfig = contractConfigs.find(
                    (config) => config.name === contractName
                );
                if (contractConfig) {
                    const requirements = contractConfig.requirements;
                    const fulfilledRequirements = {};

                    for (const requirement of requirements) {
                        if (!deployedContracts[requirement]) {
                            console.log(
                                chalk.yellow(
                                    `Loading earlier deployment of requirement: ${requirement}...`
                                )
                            );
                            deployedContracts[requirement] =
                                await loadContractAddress(requirement, network);
                        }

                        fulfilledRequirements[requirement] =
                            deployedContracts[requirement];
                    }

                    if (
                        Object.keys(fulfilledRequirements).length ===
                        requirements.length
                    ) {
                        const deployedContract = await contractConfig.deploy(
                            fulfilledRequirements
                        );
                        deployedContracts[contractName] = deployedContract;
                    } else {
                        console.warn(
                            `Not all requirements fulfilled for "${contractName}". Skipping deployment.`
                        );
                    }
                } else {
                    console.warn(
                        `Contract configuration not found for "${contractName}". Skipping deployment.`
                    );
                }
            }
            break;
        }

        case 'verify': {
            // select contract
            if (network === 'localhost') {
                console.warn('Cannot verify contracts on localhost.');
                return;
            }
            const contractSelectPrompt = await prompts({
                type: 'select',
                name: 'contract',
                message: `Select contract to verify on ${network}`,
                choices: contractConfigs.map((config) => ({
                    title: `${config.name}`,
                    value: config,
                })),
            });
            try {
                await contractSelectPrompt.contract.verify();
            } catch (error) {
                console.error(error);
            }

            break;
        }
        case 'validate-upgrade': {
            const contractSelectPrompt = await prompts({
                type: 'select',
                name: 'contracts',
                message: `Select contract to upgrade on ${network}`,
                choices: contractConfigs
                    .filter((config) => config.upgradeable)
                    .map((config) => ({
                        title: `${config.name}`,
                        value: config.name,
                    })),
            });
            await hardhat.run('compile');
            const contractName = contractSelectPrompt.contracts;
            const proxyAddress = await loadContractAddress(
                contractName,
                network
            );
            const newImplementation =
                await hardhat.ethers.getContractFactory(contractName);
            try {
                await hardhat.upgrades.validateUpgrade(
                    proxyAddress,
                    newImplementation
                );
            } catch (error) {
                console.error(error);
                return;
            }
            console.log('Upgrade is valid');
            break;
        }
        case 'upgrade': {
            const contractSelectPrompt = await prompts({
                type: 'select',
                name: 'contracts',
                message: `Select contract to upgrade on ${network}`,
                choices: contractConfigs
                    .filter((config) => config.upgradeable)
                    .map((config) => ({
                        title: `${config.name}`,
                        value: config.name,
                    })),
            });
            await hardhat.run('compile');
            const contractName = contractSelectPrompt.contracts;
            const proxyAddress = await loadContractAddress(
                contractName,
                network
            );

            const proxyAdmin = await hardhat.upgrades.admin.getInstance();
            const proxyAdminOwner = await proxyAdmin.owner();
            console.log('ProxyAdmin owner:', proxyAdminOwner);

            const newImplementation =
                await hardhat.ethers.getContractFactory(contractName);

            if (proxyAdminOwner == deployer) {
                // Deployer can perform the whole upgrade flow
                console.log('deployer is ProxyAdmin owner, continuing...');
                await hardhat.upgrades.upgradeProxy(
                    proxyAddress,
                    newImplementation,
                    {
                        // @ts-ignore
                        txOverrides: {
                            maxFeePerGas: 1000000000,
                            maxPriorityFeePerGas: 1000000000,
                        },
                    }
                );
                console.log('Upgraded contract', contractName);
                console.log('Updating DeploymentInfo...');
                try {
                    const contractObject = await hardhat.ethers.getContractAt(
                        contractName,
                        proxyAddress
                    );
                    await saveDeploymentInfo(
                        deploymentInfo(network, contractObject, contractName)
                    );
                    const contractConfig = contractConfigs.find(
                        (config) => config.name === contractName
                    );
                    // @ts-ignore
                    await contractConfig.verify();
                } catch (error) {
                    console.error(error);
                }
            } else {
                // We need to propose the upgrade through the SAFE & timelock
                const newImplementationAddress =
                    await hardhat.upgrades.prepareUpgrade(
                        proxyAddress,
                        newImplementation,
                        { timeout: 240 }
                    );
                console.log(
                    'New implementation address',
                    newImplementationAddress
                );

                console.log('Verifying new implementation...');
                await hardhat.run('verify:verify', {
                    address: newImplementationAddress,
                });
                console.log('New implementation verified.');

                // we prepare the tx to the ProxyAdmin to upgrade the contract
                // NOTE: we have to store this data for the actual execution
                const upgradeTx = await proxyAdmin.populateTransaction.upgrade(
                    proxyAddress,
                    newImplementationAddress
                );
                console.log('proxyAddress', proxyAddress);
                console.log(
                    'newImplementationAddress',
                    newImplementationAddress
                );
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
                console.log(
                    'timelockContractTxRequest',
                    timelockContractTxRequest
                );

                // Proposing the upgrade through the SAFE
                await safeContractProposal(
                    timelockContractTxRequest,
                    deployer,
                    dlcAdminSafes.critical
                );

                const implObject = await hardhat.ethers.getContractAt(
                    contractName,
                    // @ts-ignore
                    newImplementationAddress
                );
                const deploymentInfoToSave = deploymentInfo(
                    network,
                    { ...implObject, address: proxyAddress },
                    contractName,
                    upgradeTx.data
                );
                await saveDeploymentInfo(
                    deploymentInfoToSave,
                    `deploymentFiles/${network}/${contractName}.proposed.json`
                );
            }

            break;
        }
        case 'execute-upgrade': {
            const contractSelectPrompt = await prompts({
                type: 'select',
                name: 'contracts',
                message: `Select contract to upgrade on ${network}`,
                choices: contractConfigs
                    .filter((config) => config.upgradeable)
                    .map((config) => ({
                        title: `${config.name}`,
                        value: config.name,
                    })),
            });
            const contractName = contractSelectPrompt.contracts;

            const contractDeployInfo = await loadDeploymentInfo(
                network,
                contractName,
                true
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
            const proxyAdmin = await hardhat.upgrades.admin.getInstance();
            const tlRequestParams = [
                proxyAdmin.address,
                0,
                contractDeployInfo.upgradeData,
                '0x0000000000000000000000000000000000000000000000000000000000000000',
                '0x0000000000000000000000000000000000000000000000000000000000000000',
            ];

            console.log('Executing upgrade...');
            await timelockContract
                .connect(deployer)
                .execute(...tlRequestParams);

            console.log('Updating DeploymentInfo...');
            await fs.copyFile(
                `deploymentFiles/${network}/${contractName}.proposed.json`,
                `deploymentFiles/${network}/${contractName}.json`
            );
            await fs.rm(
                `deploymentFiles/${network}/${contractName}.proposed.json`
            );
            console.log('DeploymentInfo updated.');

            break;
        }
        // NOTE: TODO: This will be useful for one time, while we transfer from the old TokenManager
        // After that this will change to transfering from the DLCManager, if ever
        case 'transfer-dlcbtc': {
            const dlcBTCAddress = await loadContractAddress('DLCBTC', network);
            const dlcBTC = await hardhat.ethers.getContractAt(
                'DLCBTC',
                dlcBTCAddress
            );
            const currentOwner = await dlcBTC.owner();
            console.log(chalk.bgYellow('Current DLCBTC owner:', currentOwner));
            const oldTokenManager = await hardhat.ethers.getContractAt(
                'TokenManager',
                currentOwner
            );
            const newAdmin = await prompts({
                type: 'text',
                name: 'value',
                message: 'Enter new DLCBTC owner address',
            });
            if (!newAdmin.value) return;

            if (
                network === 'localhost' ||
                (await oldTokenManager.hasRole(
                    hardhat.ethers.utils.id('DLC_ADMIN_ROLE'),
                    deployer.address
                ))
            ) {
                console.log('deployer has DLC_ADMIN_ROLE, continuing...');
                console.log(
                    'Transferring ownership of DLCBTC...',
                    newAdmin.value
                );
                await oldTokenManager
                    .connect(deployer)
                    .transferTokenContractOwnership(newAdmin.value);
            } else {
                const txRequest = await oldTokenManager
                    .connect(deployer)
                    .populateTransaction.transferTokenContractOwnership(
                        newAdmin.value
                    );
                await safeContractProposal(txRequest, deployer);
            }
            break;
        }
        case 'transfer-admin': {
            const dlcManagerAddress = await loadContractAddress(
                'DLCManager',
                network
            );
            const dlcManager = await hardhat.ethers.getContractAt(
                'DLCManager',
                dlcManagerAddress
            );
            const currentAdmin = await dlcManager.defaultAdmin();
            console.log(
                chalk.bgYellow('Current DEFAULT_ADMIN_ROLE:', currentAdmin)
            );
            const newAdmin = await prompts({
                type: 'text',
                name: 'value',
                message: 'Enter new DEFAULT_ADMIN_ROLE address',
            });
            if (!newAdmin.value) return;
            if (newAdmin.value != dlcAdminSafes.critical) {
                if (
                    (await promptUser(
                        'Are you sure you want to transfer DEFAULT_ADMIN_ROLE to a non-critical address?'
                    )) === false
                )
                    return;
            }

            console.log('Transferring ownership of DEFAULT_ADMIN_ROLE...');
            const txRequest = await dlcManager.beginDefaultAdminTransfer(
                newAdmin.value
            );
            console.log(await txRequest.wait());
            console.log(
                'Transferred ownership of DEFAULT_ADMIN_ROLE to:',
                await dlcManager.defaultAdmin()
            );

            break;
        }
        case 'transfer-proxyadmin': {
            const currentAdmin = await (
                await hardhat.upgrades.admin.getInstance()
            ).functions['owner()']();

            console.log(
                chalk.bgYellow('Current ProxyAdmin owner:', currentAdmin)
            );
            if (currentAdmin == dlcAdminSafes.critical) {
                console.log(
                    chalk.bgRed(
                        'Current ProxyAdmin owner is the Critical Multisig Already!'
                    )
                );
                if (
                    (await promptUser('Are you sure you want to continue?')) ===
                    false
                )
                    return;
            }

            const newAdmin = await prompts({
                type: 'text',
                name: 'value',
                message: 'Enter new ProxyAdmin address',
            });
            if (!newAdmin.value) return;
            console.log('Transferring ownership of ProxyAdmin...');
            await hardhat.upgrades.admin.transferProxyAdminOwnership(
                newAdmin.value
            );
            console.log(
                'Transferred ownership of ProxyAdmin to:',
                newAdmin.value
            );
            break;
        }
        default:
            break;
    }
};
