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
            { title: 'Verify Contract', value: 'verify' },
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
            const newImplementation =
                await hardhat.ethers.getContractFactory(contractName);
            const newImplementationAddress =
                await hardhat.upgrades.prepareUpgrade(
                    proxyAddress,
                    newImplementation
                );
            console.log('New implementation address', newImplementationAddress);

            try {
                await hardhat.upgrades.upgradeProxy(
                    proxyAddress,
                    newImplementation
                );
                console.log('Upgraded contract', contractName);
                console.log('Updating DeploymentInfo...');
                try {
                    const contractObject = await hardhat.ethers.getContractAt(
                        contractName,
                        proxyAddress
                    );
                    await saveDeploymentInfo(
                        deploymentInfo(hardhat, contractObject, contractName)
                    );
                } catch (error) {
                    console.error(error);
                }
            } catch (error) {
                console.log(chalk.bgYellow('Try upgrading from the SAFE'));
                console.log(
                    'Dont forget to update the deployment info afterwards'
                );
                console.error(error);
            }

            break;
        }
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
            // this should call the transfer ADMIN role process for a given contract BY THE DEPLOYER.
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

    let mockDLCManager, dlcBtc, tokenManager;

    // const MockDLCManager =
    //     await hardhat.ethers.getContractFactory('MockDLCManager');
    // mockDLCManager = await MockDLCManager.deploy();
    // await mockDLCManager.deployed();
    // console.log(
    //     `deployed contract MockDLCManager to ${mockDLCManager.address}`
    // );

    // const DLCBTC = await hardhat.ethers.getContractFactory('DLCBTC', deployer);
    // dlcBtc = await DLCBTC.deploy();
    // await dlcBtc.deployed();
    // console.log(`deployed contract DLCBTC to ${dlcBtc.address}`);

    // try {
    //     await hardhat.run('verify:verify', {
    //         address: '0x5A1F3122F1Fe39954C9333FC21cBEfcD34b1953c',
    //         constructorArguments: [],
    //     });
    // } catch (error) {
    //     console.error(error);
    // }

    // const TokenManager = await hardhat.ethers.getContractFactory(
    //     'TokenManager',
    //     deployer
    // );
    // tokenManager = await hardhat.upgrades.deployProxy(TokenManager, [
    //     '0x8A322400B76a6eaE7A8A95b2318AfeFa67f1aaDB',
    //     '0x5A1F3122F1Fe39954C9333FC21cBEfcD34b1953c',
    //     routerWallet.address,
    // ]);
    // console.log(`deployed contract TokenManager to ${tokenManager.address}`);

    // dlcBtc = await hardhat.ethers.getContractAt(
    //     'DLCBTC',
    //     '0x5A1F3122F1Fe39954C9333FC21cBEfcD34b1953c'
    // );
    // 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
    // await dlcBtc.transferOwnership(tokenManager.address);
    // await dlcBtc.transferOwnership(
    //     '0x650D9c6Ecd07A207e5982F0355C8AFB35eEE03Ac'
    // );
    // console.log(`transferred ownership of DLCBTC to TokenManager`);

    // this takes the proxy address.
    // try {
    //     await hardhat.run('verify:verify', {
    //         address: '0x650D9c6Ecd07A207e5982F0355C8AFB35eEE03Ac',
    //     });
    // } catch (error) {
    //     console.error(error);
    // }

    // const V1 = await hardhat.ethers.getContractFactory('TokenManager');
    // const address = await hardhat.upgrades.prepareUpgrade(
    //     '0x650D9c6Ecd07A207e5982F0355C8AFB35eEE03Ac',
    //     V1
    // );
    // console.log(address);
    // 0xf97EAb55C5958877b794498dfE34976ED2BE34f7 -- v2 address

    // const gnosisSafe = '0x7bE48abb024eC70bd3E74521589a94657eF03986';

    // console.log('Transferring ownership of ProxyAdmin...');
    // // The owner of the ProxyAdmin can upgrade our contracts
    // await hardhat.upgrades.admin.transferProxyAdminOwnership(gnosisSafe);
    // console.log('Transferred ownership of ProxyAdmin to:', gnosisSafe);
};
