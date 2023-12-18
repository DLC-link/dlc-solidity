const hardhat = require('hardhat');

const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const safeContractProposal = require('./helpers/safe-api-service');
const loadContractAddress = require('./helpers/utils').loadContractAddress;
const registerProtocol = require('./04-register-protocol');
const chalk = require('chalk');

module.exports = async function setupTokenManager(
    routerWalletAddress,
    version
) {
    const accounts = await hardhat.ethers.getSigners();
    // NOTE: should be key_for_safe
    const admin = accounts[0];

    const tokenManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'TokenManager',
        version
    );

    const tokenManager = new hardhat.ethers.Contract(
        tokenManagerDeployInfo.contract.address,
        tokenManagerDeployInfo.contract.abi,
        admin
    );

    if (
        hardhat.network.name === 'localhost' ||
        (await tokenManager.hasRole(
            hardhat.ethers.utils.id('DLC_ADMIN_ROLE'),
            admin.address
        ))
    ) {
        console.log('admin has DLC_ADMIN_ROLE');

        await registerProtocol(tokenManager.address, routerWalletAddress);
        const dlcBTCAddress = await loadContractAddress(
            'DLCBTC',
            hardhat.network.name,
            version
        );
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

        console.log(
            'Transferring ownership of DLCBTC...',
            tokenManager.address
        );
        await oldTokenManager
            .connect(deployer)
            .transferTokenContractOwnership(tokenManager.address);

        return;
    } else {
        console.log(chalk.bgRed('TODO'));
        return;
    }
};
