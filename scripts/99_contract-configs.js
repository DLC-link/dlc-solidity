const hardhat = require('hardhat');
const chalk = require('chalk');
const {
    saveDeploymentInfo,
    deploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const { promptUser, loadContractAddress } = require('./helpers/utils');
const getChainLinkBTCPriceFeedAddress = require('./helpers/chainlink-pricefeed-addresses');
const grantRoleOnManager = require('./00-grant-role-on-manager');

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
async function afterDeployment(contractName, contractObject, version) {
    console.log(
        `Deployed contract ${contractName} to ${contractObject.address}`
    );
    try {
        await saveDeploymentInfo(
            deploymentInfo(hardhat, contractObject, contractName),
            version
        );
    } catch (error) {
        console.error(error);
    }
}

module.exports = function getContractConfigs(networkConfig) {
    const network = hardhat.network.name;
    const { version, deployer, routerWallet, dlcAdminSafe } = networkConfig;
    return [
        {
            name: 'DLCManager',
            deployer: deployer.address,
            upgradeable: true,
            requirements: [],
            deploy: async (requirementAddresses) => {
                await beforeDeployment(
                    'DLCManager',
                    `_adminAddress: ${dlcAdminSafe}`,
                    network
                );
                const DLCManager =
                    await hardhat.ethers.getContractFactory('DLCManager');
                const dlcManager = await hardhat.upgrades.deployProxy(
                    DLCManager,
                    [dlcAdminSafe]
                );
                await dlcManager.deployed();

                await afterDeployment('DLCManager', dlcManager, version);

                return dlcManager.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
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
            deploy: async (requirementAddresses) => {
                await beforeDeployment('DLCBTC', '', network);

                const DLCBTC =
                    await hardhat.ethers.getContractFactory('DLCBTC');
                const dlcBtc = await DLCBTC.deploy();
                await dlcBtc.deployed();

                await afterDeployment('DLCBTC', dlcBtc, version);

                return dlcBtc.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
                    'DLCBTC',
                    network,
                    version
                );
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
                const DLCBTCAddress = requirementAddresses['DLCBTC'];
                if (!DLCBTCAddress)
                    throw new Error('DLCBTC deployment not found.');
                const DLCManagerAddress = requirementAddresses['DLCManager'];
                if (!DLCManagerAddress)
                    throw new Error('DLCManager deployment not found.');

                await beforeDeployment(
                    'TokenManager',
                    `_adminAddress: ${dlcAdminSafe}, _dlcManager: ${DLCManagerAddress}, _dlcBtc: ${DLCBTCAddress}, _routerWallet: ${routerWallet.address}`,
                    network
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

                await afterDeployment('TokenManager', tokenManager, version);

                const shouldTransferOwnership = await promptUser(
                    `Would you like to transfer ownership of DLCBTC contract to ${tokenManager.address}?`
                );
                if (shouldTransferOwnership) {
                    const dlcBtc = await hardhat.ethers.getContractAt(
                        'DLCBTC',
                        DLCBTCAddress
                    );
                    const currentOwner = await dlcBtc.owner();
                    console.log(
                        chalk.bgYellow('Current DLCBTC owner:', currentOwner)
                    );
                    const oldTokenManager = await hardhat.ethers.getContractAt(
                        'TokenManager',
                        currentOwner
                    );

                    console.log(
                        'Transferring ownership of DLCBTC...',
                        tokenManager.address
                    );
                    await oldTokenManager
                        .connect(deployer)
                        .transferTokenContractOwnership(tokenManager.address);
                }

                return tokenManager.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
                    'TokenManager',
                    network,
                    version
                );
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
        {
            name: 'USDC',
            deployer: deployer.address,
            upgradeable: false,
            requirements: [],
            deploy: async (requirementAddresses) => {
                await beforeDeployment('USDC', '', network);
                const USDC = await hardhat.ethers.getContractFactory(
                    'USDStableCoinForDLCs'
                );
                const usdc = await USDC.deploy();
                await usdc.deployed();
                await afterDeployment('USDC', usdc, version);
                return usdc.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
                    'USDC',
                    network,
                    version
                );
                await hardhat.run('verify:verify', {
                    address: address,
                });
            },
        },
        {
            name: 'LendingContract',
            deployer: deployer.address,
            upgradeable: false,
            requirements: ['USDC', 'DLCManager'],
            deploy: async (requirementAddresses) => {
                const dlcManagerAddress = requirementAddresses['DLCManager'];
                if (!dlcManagerAddress)
                    throw new Error('DLCManager deployment not found.');
                const usdcAddress = requirementAddresses['USDC'];
                if (!usdcAddress) throw new Error('USDC deployment not found.');

                const pricefeedAddress =
                    await getChainLinkBTCPriceFeedAddress(network);

                await beforeDeployment(
                    'LendingContract',
                    `_dlcManager: ${dlcManagerAddress}, _usdc: ${usdcAddress}, _routerWallet: ${routerWallet.address}, _pricefeed: ${pricefeedAddress}`,
                    network
                );

                const LendingDemo =
                    await hardhat.ethers.getContractFactory('LendingContract');
                const lendingDemo = await LendingDemo.deploy(
                    dlcManagerAddress,
                    usdcAddress,
                    routerWallet.address,
                    pricefeedAddress
                );
                await lendingDemo.deployed();

                await afterDeployment('LendingContract', lendingDemo, version);

                if (network === 'localhost') {
                    const shouldMintUsdc = await promptUser(
                        `Would you like to mint 10M USDC to LendingContract @ ${lendingDemo.address}?`
                    );
                    if (shouldMintUsdc) {
                        const usdc = await hardhat.ethers.getContractAt(
                            'USDStableCoinForDLCs',
                            usdcAddress
                        );
                        const tx = await usdc.mint(
                            lendingDemo.address,
                            hardhat.ethers.utils.parseUnits('10000000', 'ether')
                        );
                        const receipt = await tx.wait();
                        console.log(`Done in tx: ${receipt}`);
                    }
                }

                const shouldWhitelistLendingDemo = await promptUser(
                    `Would you like to whitelist LendingContract @ ${lendingDemo.address} in DLCManager @ ${dlcManagerAddress}?`
                );
                if (shouldWhitelistLendingDemo) {
                    await grantRoleOnManager(
                        'WHITELISTED_CONTRACT',
                        lendingDemo.address,
                        version
                    );
                    await grantRoleOnManager(
                        'WHITELISTED_WALLET',
                        routerWallet.address,
                        version
                    );
                }

                return lendingDemo.address;
            },
            verify: async () => {
                const address = await loadContractAddress(
                    'LendingContract',
                    network,
                    version
                );
                const dlcManagerAddress = await loadContractAddress(
                    'DLCManager',
                    network,
                    version
                );
                const usdcAddress = await loadContractAddress(
                    'USDC',
                    network,
                    version
                );
                const pricefeedAddress =
                    await getChainLinkBTCPriceFeedAddress(network);

                await hardhat.run('verify:verify', {
                    address: address,
                    constructorArguments: [
                        dlcManagerAddress,
                        usdcAddress,
                        routerWallet.address,
                        pricefeedAddress,
                    ],
                });
            },
        },
    ];
};

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
