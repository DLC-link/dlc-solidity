require('dotenv').config();
const hardhat = require('hardhat');

const prompts = require('prompts');
const chalk = require('chalk');
const {
    saveDeploymentInfo,
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned.js');
const dlcAdminSafes = require('./helpers/dlc-admin-safes.js');

async function promptUser(message) {
    const response = await prompts({
        type: 'confirm',
        name: 'continue',
        message,
        initial: false,
    });
    return response.continue;
}

async function loadContract(requirement, network, version) {
    const deployment = await loadDeploymentInfo(network, requirement, version);
    if (!deployment) {
        const shouldContinue = await promptUser(
            `Deployment "${requirement}" not found. Continue?`
        );
        if (!shouldContinue) {
            throw new Error('Deployment aborted by user.');
        }
        return undefined;
    }
    return deployment.contract.address;
}

module.exports = async function contractAdmin(_version) {
    const network = hardhat.network.name;
    const version = _version;
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const routerWallet = accounts[2];
    const dlcAdminSafe = dlcAdminSafes[network];
    if (!dlcAdminSafe) throw new Error('DLC Admin Safe address not found.');

    const contractConfigs = [
        {
            name: 'AttestorManager',
            deployer: deployer.address,
            upgradeable: false,
            requirements: [],
            deploy: async (contracts) => {
                console.log(`Deploying AttestorManager to ${network}...`);
                const AttestorManager =
                    await hardhat.ethers.getContractFactory('AttestorManager');
                const attestorManager = await AttestorManager.deploy();
                await attestorManager.deployed();
                console.log(
                    `Deployed contract AttestorManager to ${attestorManager.address} (network: ${network})`
                );
                await saveDeploymentInfo(
                    deploymentInfo(hardhat, attestorManager, 'AttestorManager'),
                    version
                );
                return attestorManager.address;
            },
            verify: async () => {
                const address = await loadContract(
                    'AttestorManager',
                    network,
                    version
                );
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
        {
            name: 'DLCManager',
            deployer: deployer.address,
            upgradeable: true,
            requirements: ['AttestorManager'],
            deploy: async (contracts) => {
                const attestorManagerAddress = contracts['AttestorManager'];
                if (!attestorManagerAddress)
                    throw new Error('AttestorManager deployment not found.');
                const shouldContinue = await promptUser(
                    `You are about to deploy DLCManager to ${network}.\nContructor arguments: _adminAddress: ${dlcAdminSafe}, _attestorManager: ${attestorManagerAddress}\n Continue?`
                );
                if (!shouldContinue) {
                    throw new Error('Deployment aborted by user.');
                }
                console.log(
                    `Deploying contract DLCManager to network "${network}"...`
                );
                const DLCManager =
                    await hardhat.ethers.getContractFactory('DLCManager');
                const dlcManager = await hardhat.upgrades.deployProxy(
                    DLCManager,
                    [dlcAdminSafe, attestorManagerAddress]
                );
                await dlcManager.deployed();
                console.log(
                    `Deployed contract DLCManager to ${dlcManager.address} (network: ${network})`
                );
                await saveDeploymentInfo(
                    deploymentInfo(hardhat, dlcManager, 'DlcManager'),
                    version
                );
                return dlcManager.address;
            },
            verify: async () => {
                const address = await loadContract(
                    'DlcManager',
                    network,
                    version
                );
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
        {
            name: 'DLCBTC',
            deployer: deployer.address,
            upgradeable: false,
            requirements: [],
            deploy: async (contracts) => {
                console.log(
                    `deploying contract DLCBTC to network "${network}"...`
                );
                const DLCBTC =
                    await hardhat.ethers.getContractFactory('DLCBTC');
                const dlcBtc = await DLCBTC.deploy();
                await dlcBtc.deployed();
                console.log(
                    `deployed contract DLCBTC to ${dlcBtc.address} (network: ${network})`
                );
                await saveDeploymentInfo(
                    deploymentInfo(hardhat, dlcBtc, 'DLCBTC'),
                    version
                );
                return dlcBtc.address;
            },
            verify: async () => {
                const address = await loadContract('DLCBTC', network, version);
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
        {
            name: 'TokenManager',
            deployer: deployer.address,
            upgradeable: true,
            requirements: ['DLCBTC', 'DLCManager'],
            deploy: async (contracts) => {
                const DLCBTCAddress = contracts['DLCBTC'];
                if (!DLCBTCAddress)
                    throw new Error('DLCBTC deployment not found.');
                const DLCManagerAddress = contracts['DLCManager'];
                if (!DLCManagerAddress)
                    throw new Error('DLCManager deployment not found.');
                console.log(
                    `Deploying contract TokenManager to network "${network}"...`
                );

                const TokenManager = await hardhat.ethers.getContractFactory(
                    'TokenManager',
                    deployer
                );
                const tokenManager = await hardhat.upgrades.deployProxy(
                    TokenManager,
                    [
                        dlcAdminSafe,
                        DLCManagerAddress,
                        DLCBTCAddress,
                        routerWallet.address,
                    ]
                );
                await tokenManager.deployed();
                console.log(
                    `Deployed contract TokenManager to ${tokenManager.address} (network: ${network})`
                );
                await saveDeploymentInfo(
                    deploymentInfo(hardhat, tokenManager, 'TokenManager'),
                    version
                );

                const shouldTransferOwnership = await promptUser(
                    `Would you like to transfer ownership of DLCBTC contract to ${tokenManager.address}?`
                );
                if (shouldTransferOwnership) {
                    const dlcBtc = await hardhat.ethers.getContractAt(
                        'DLCBTC',
                        DLCBTCAddress
                    );
                    await dlcBtc.transferOwnership(tokenManager.address);
                    console.log(
                        `Transferred ownership of DLCBTC to TokenManager at ${tokenManager.address}`
                    );
                }

                return tokenManager.address;
            },
            verify: async () => {
                const address = await loadContract(
                    'TokenManager',
                    network,
                    version
                );
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
    ];

    let response = await prompts({
        type: 'confirm',
        name: 'continue',
        message: `You are about to interact with network: ${network}.\nDeployer account: ${deployer.address}\nRouter-wallet account: ${routerWallet.address}\nContinue?`,
        initial: false,
    });
    if (!response.continue) {
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
            {
                title: 'Transfer DLCBTC Ownership',
                value: 'transfer-dlcbtc',
                description: 'Transfer ownership of DLCBTC after deployment',
            },
            {
                title: 'Begin Transfer DEFAULT_ADMIN_ROLE',
                value: 'transfer-admin',
            },
            { title: 'Upgrade Proxy Implementation', value: 'upgrade' },
            { title: 'Verify Contract', value: 'verify' },
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
                            deployedContracts[requirement] = await loadContract(
                                requirement,
                                network,
                                version
                            );
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
        case 'transfer-admin': {
            // this should call the transfer ADMIN role process for a given contract BY THE DEPLOYER.
            break;
        }
        case 'upgrade': {
            // select contract to upgrade
            // test? prompt? confirm?
            // upgrade
            // wait and verify
            break;
        }
        case 'verify': {
            // select contract
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
