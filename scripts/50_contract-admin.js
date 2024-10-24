require('dotenv').config();
const hardhat = require('hardhat');

const prompts = require('prompts');
const chalk = require('chalk');
const dlcAdminSafesConfigs = require('./helpers/dlc-admin-safes');
const getContractConfigs = require('./99_contract-configs');
const { promptUser, loadContractAddress } = require('./helpers/utils');
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
            { title: 'Validate an Upgrade', value: 'validate-upgrade' },
            { title: 'Upgrade Proxy Implementation', value: 'upgrade' },
            {
                title: 'Transfer DLCBTC Ownership',
                value: 'transfer-dlcbtc',
                description: 'Transfer ownership of DLCBTC after deployment',
            },
            {
                title: 'Begin Transfer DEFAULT_ADMIN_ROLE',
                value: 'transfer-admin',
            },
            {
                title: 'Transfer ProxyAdmin Ownership',
                value: 'transfer-proxyadmin',
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
                name: 'contracts',
                message: `Select contract to verify on ${network}`,
                choices: contractConfigs.map((config) => ({
                    title: `${config.name}`,
                    value: config.name,
                })),
            });
            const contractName = contractSelectPrompt.contracts;
            const contractConfig = contractConfigs.find(
                (config) => config.name === contractName
            );
            try {
                await contractConfig.verify();
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
            const validation = await hardhat.upgrades.validateUpgrade(
                proxyAddress,
                newImplementation
            );
            if (!validation) {
                console.log('Upgrade is valid');
                return;
            }
            console.log(validation);
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
            const proxyAdminAddress =
                await hardhat.upgrades.erc1967.getAdminAddress(proxyAddress);

            const proxyAdmin = new hardhat.ethers.Contract(
                proxyAdminAddress,
                ['function owner() view returns (address)'],
                deployer
            );
            const proxyAdminOwner = await proxyAdmin.owner();
            console.log('ProxyAdmin owner:', proxyAdminOwner);

            const newImplementation =
                await hardhat.ethers.getContractFactory(contractName);

            if (proxyAdminOwner == deployer) {
                console.log('deployer is ProxyAdmin owner, continuing...');
                await hardhat.upgrades.upgradeProxy(
                    proxyAddress,
                    newImplementation,
                    {
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
                } catch (error) {
                    console.error(error);
                }
            } else {
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

                try {
                    await hardhat.upgrades.upgradeProxy(
                        proxyAddress,
                        newImplementation
                    );
                    console.log('Upgraded contract', contractName);
                    console.log('Updating DeploymentInfo...');
                    try {
                        const contractObject =
                            await hardhat.ethers.getContractAt(
                                contractName,
                                proxyAddress
                            );
                        await saveDeploymentInfo(
                            deploymentInfo(
                                network,
                                contractObject,
                                contractName
                            )
                        );
                    } catch (error) {
                        console.error(error);
                    }
                } catch (error) {
                    console.error(error);
                    console.log(chalk.bgYellow('Upgrade through the SAFE!'));
                    const implObject = await hardhat.ethers.getContractAt(
                        contractName,
                        newImplementationAddress
                    );
                    const deploymentInfoToSave = deploymentInfo(
                        network,
                        { ...implObject, address: proxyAddress },
                        contractName
                    );
                    await saveDeploymentInfo(deploymentInfoToSave);
                    console.log(deploymentInfoToSave);
                    console.log(chalk.bgRed('Upgrade through the SAFE!'));
                }
            }

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
            if (currentAdmin == dlcAdminSafes.critical) return;

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
