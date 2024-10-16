const hardhat = require('hardhat');
const chalk = require('chalk');
const {
    saveDeploymentInfo,
    deploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const {
    promptUser,
    loadContractAddress,
    getMinimumDelay,
} = require('./helpers/utils');

// This is a pure function that just logs
async function beforeDeployment(contractName, constructorArguments, network) {
    const shouldContinue = await promptUser(
        `You are about to deploy ${contractName} to ${network}.\nContructor arguments: ${constructorArguments}\n Continue?`
    );
    if (!shouldContinue) {
        throw new Error('Deployment aborted by user.');
    }
    console.log(`Deploying ${contractName} to ${network}...`);
}

// This is an effectful function that saves deployment info
// contractName will be used as the key in the deployment info!
async function afterDeployment(contractName, contractObject, networkName) {
    console.log(
        `Deployed contract ${contractName} to ${contractObject.address} on ${networkName}`
    );
    try {
        await saveDeploymentInfo(
            deploymentInfo(networkName, contractObject, contractName)
        );
    } catch (error) {
        console.error(error);
    }
}

module.exports = function getContractConfigs(networkConfig, _btcFeeRecipient) {
    const { deployer, dlcAdminSafes, networkName } = networkConfig;
    const btcFeeRecipient =
        _btcFeeRecipient ?? '0014e60f61fa2f2941217934d5f9976bf27381b3b036';
    const threshold = 2;
    const minimumDelay = getMinimumDelay(networkName);
    const proposers = [dlcAdminSafes.critical];
    const executors = [dlcAdminSafes.critical, deployer.address];
    const timelockConstructorArgs = [
        minimumDelay,
        proposers,
        executors,
        hardhat.ethers.constants.AddressZero, // no admin
    ];

    return [
        {
            name: 'DLCBTC',
            deployer: deployer.address,
            upgradeable: true,
            requirements: [],
            deploy: async (requirementAddresses) => {
                await beforeDeployment('DLCBTC', '', networkName);

                const DLCBTC =
                    await hardhat.ethers.getContractFactory('DLCBTC');
                const dlcBtc = await hardhat.upgrades.deployProxy(DLCBTC);
                await dlcBtc.deployed();

                await afterDeployment('DLCBTC', dlcBtc, networkName);

                return dlcBtc.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
                    'DLCBTC',
                    networkName
                );
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
        {
            name: 'TimelockController',
            deployer: deployer.address,
            upgradeable: false,
            requirements: [],
            deploy: async (requirementAddresses) => {
                await beforeDeployment(
                    'TimelockController',
                    timelockConstructorArgs,
                    networkName
                );

                const TimelockController =
                    await hardhat.ethers.getContractFactory(
                        'TimelockController'
                    );
                const timelockController = await TimelockController.deploy(
                    ...timelockConstructorArgs
                );
                await timelockController.deployed();

                await afterDeployment(
                    'TimelockController',
                    timelockController,
                    networkName
                );

                return timelockController.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
                    'TimelockController',
                    networkName
                );
                await hardhat.run('verify:verify', {
                    address: address,
                    constructorArguments: timelockConstructorArgs,
                });
            },
        },
        {
            name: 'DLCManager',
            deployer: deployer.address,
            upgradeable: true,
            requirements: ['DLCBTC'],
            deploy: async (requirementAddresses) => {
                // const defaultAdmin = deployer.address;
                // const dlcAdmin = deployer.address;
                const defaultAdmin = dlcAdminSafes.critical;
                const dlcAdmin = dlcAdminSafes.medium;
                const DLCBTCAddress = requirementAddresses['DLCBTC'];
                if (!DLCBTCAddress)
                    throw new Error('DLCBTC deployment not found.');
                await beforeDeployment(
                    'DLCManager',
                    `defaultAdmin: ${defaultAdmin}, \
                    dlcAdminRole: ${dlcAdmin}, \
                    threshold: ${threshold}, \
                    tokenContract: ${DLCBTCAddress}, \
                    btcFeeRecipient: ${btcFeeRecipient}`,
                    networkName
                );
                const DLCManager =
                    await hardhat.ethers.getContractFactory('DLCManager');
                const dlcManager = await hardhat.upgrades.deployProxy(
                    DLCManager,
                    [
                        defaultAdmin,
                        dlcAdmin,
                        threshold,
                        DLCBTCAddress,
                        btcFeeRecipient,
                    ]
                );
                await dlcManager.deployed();

                await afterDeployment('DLCManager', dlcManager, networkName);

                const dlcBtc = await hardhat.ethers.getContractAt(
                    'DLCBTC',
                    DLCBTCAddress
                );
                const currentOwner = await dlcBtc.owner();
                console.log(
                    chalk.bgYellow('Current DLCBTC owner:', currentOwner)
                );

                if (currentOwner === dlcManager.address) {
                    console.log(
                        'DLCBTC is already owned by DLCManager, skipping transfer...'
                    );
                } else {
                    const shouldTransferOwnership = await promptUser(
                        `Would you like to transfer ownership of DLCBTC contract to ${dlcManager.address}?`
                    );
                    if (shouldTransferOwnership) {
                        if (currentOwner === deployer.address) {
                            console.log(
                                'DLCBTC is owned by deployer, transferring ownership...'
                            );
                            const tx = await dlcBtc
                                .connect(deployer)
                                .transferOwnership(dlcManager.address);
                            await tx.wait();
                        } else {
                            const oldDlcManager =
                                await hardhat.ethers.getContractAt(
                                    'DLCManager',
                                    currentOwner
                                );
                            const tx = await oldDlcManager
                                .connect(deployer)
                                .transferTokenContractOwnership(
                                    dlcManager.address
                                );
                            const receipt = await tx.wait();
                            console.log(receipt);
                        }

                        const newOwner = await dlcBtc.owner();
                        console.log('New DLCBTC Owner:', newOwner);
                    }
                }

                return dlcManager.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
                    'DlcManager',
                    networkName
                );
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
    ];
};
