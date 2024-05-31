const hardhat = require('hardhat');
const chalk = require('chalk');
const {
    saveDeploymentInfo,
    deploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const { promptUser, loadContractAddress } = require('./helpers/utils');
const getChainLinkBTCPriceFeedAddress = require('./helpers/chainlink-pricefeed-addresses');
const { registerProtocol } = require('./00-grant-role-on-manager');

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
async function afterDeployment(contractName, contractObject) {
    console.log(
        `Deployed contract ${contractName} to ${contractObject.address}`
    );
    try {
        await saveDeploymentInfo(
            deploymentInfo(hardhat, contractObject, contractName)
        );
    } catch (error) {
        console.error(error);
    }
}

module.exports = function getContractConfigs(networkConfig, _btcFeeRecipient) {
    const network = hardhat.network.name;
    const { deployer, dlcAdminSafes } = networkConfig;
    const btcFeeRecipient =
        _btcFeeRecipient ?? '0014e60f61fa2f2941217934d5f9976bf27381b3b036';
    const threshold = 2;

    return [
        {
            name: 'DLCManager',
            deployer: deployer.address,
            upgradeable: true,
            requirements: [],
            deploy: async (requirementAddresses) => {
                const defaultAdmin = dlcAdminSafes.critical;
                const dlcAdmin = dlcAdminSafes.medium;
                await beforeDeployment(
                    'DLCManager',
                    `defaultAdmin: ${defaultAdmin}, dlcAdminRole: ${dlcAdmin}, threshold: ${threshold}`,
                    network
                );
                const DLCManager =
                    await hardhat.ethers.getContractFactory('DLCManager');
                const dlcManager = await hardhat.upgrades.deployProxy(
                    DLCManager,
                    [defaultAdmin, dlcAdmin, threshold]
                );
                await dlcManager.deployed();

                await afterDeployment('DLCManager', dlcManager);

                return dlcManager.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
                    'DlcManager',
                    network
                );
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
        {
            name: 'DLCBTC',
            deployer: deployer.address,
            upgradeable: true,
            requirements: [],
            deploy: async (requirementAddresses) => {
                await beforeDeployment('DLCBTC', '', network);

                const DLCBTC =
                    await hardhat.ethers.getContractFactory('DLCBTC');
                const dlcBtc = await hardhat.upgrades.deployProxy(DLCBTC);
                await dlcBtc.deployed();

                await afterDeployment('DLCBTC', dlcBtc);

                return dlcBtc.address;
            },
            verify: async () => {
                const address = await loadContractAddress('DLCBTC', network);
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
            deploy: async (requirementAddresses) => {
                const defaultAdmin = dlcAdminSafes.critical;
                const dlcAdmin = dlcAdminSafes.medium;
                const DLCBTCAddress = requirementAddresses['DLCBTC'];
                if (!DLCBTCAddress)
                    throw new Error('DLCBTC deployment not found.');
                const DLCManagerAddress = requirementAddresses['DLCManager'];
                if (!DLCManagerAddress)
                    throw new Error('DLCManager deployment not found.');

                await beforeDeployment(
                    'TokenManager',
                    `defaultAdmin: ${defaultAdmin}, _adminAddress: ${dlcAdmin}, _dlcManager: ${DLCManagerAddress}, _dlcBtc: ${DLCBTCAddress}, _btcFeeRecipient: ${btcFeeRecipient}`,
                    network
                );

                const TokenManager = await hardhat.ethers.getContractFactory(
                    'TokenManager',
                    deployer
                );
                const tokenManager = await hardhat.upgrades.deployProxy(
                    TokenManager,
                    [
                        defaultAdmin,
                        dlcAdmin,
                        DLCManagerAddress,
                        DLCBTCAddress,
                        btcFeeRecipient,
                    ]
                );
                await tokenManager.deployed();

                await afterDeployment('TokenManager', tokenManager);

                const dlcBtc = await hardhat.ethers.getContractAt(
                    'DLCBTC',
                    DLCBTCAddress
                );
                const currentOwner = await dlcBtc.owner();
                console.log(
                    chalk.bgYellow('Current DLCBTC owner:', currentOwner)
                );

                const shouldTransferOwnership = await promptUser(
                    `Would you like to transfer ownership of DLCBTC contract to ${tokenManager.address}?`
                );
                if (shouldTransferOwnership) {
                    if (currentOwner === deployer.address) {
                        console.log(
                            'DLCBTC is owned by deployer, transferring ownership...'
                        );
                        const tx = await dlcBtc
                            .connect(deployer)
                            .transferOwnership(tokenManager.address);
                        await tx.wait();
                    } else {
                        const oldTokenManager =
                            await hardhat.ethers.getContractAt(
                                'TokenManager',
                                currentOwner
                            );
                        const tx = await oldTokenManager
                            .connect(deployer)
                            .transferTokenContractOwnership(
                                tokenManager.address
                            );
                        const receipt = await tx.wait();
                        console.log(receipt);
                    }

                    const newOwner = await dlcBtc.owner();
                    console.log('New DLCBTC Owner:', newOwner);
                }

                const shouldRegisterProtocol = await promptUser(
                    `Would you like to register TokenManager @ ${tokenManager.address} on DLCManager @ ${DLCManagerAddress}?`
                );
                if (shouldRegisterProtocol) {
                    await registerProtocol(tokenManager.address);
                }

                return tokenManager.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
                    'TokenManager',
                    network
                );
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
    ];
};
