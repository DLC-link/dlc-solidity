#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const { Command } = require('commander');
const version = require('../package.json').version;
const deployAll = require('./00_deploy-all');
const mintStablecoin = require('./01_mint-usdc');
const addRoleToManager = require('./02_add-role-to-manager');
const addRoleToBtcNft = require('./03_add-role-to-btcnft');
const lendingSetupLoan = require('./04_lending-setup-loan');
const lendingCloseLoan = require('./05_lending-close-loan');
const nftSetupVault = require('./06_nft-setup-vault');
const deploySpecific = require('./07_deploy-specific');
const sendEth = require('./08_send-eth');
const sendNFT = require('./09_send-nft');

async function main() {
    const program = new Command();

    program
        .name('dlc-link-eth')
        .description('CLI scripts to help with DLC.Link utilities')
        .version(`${version}`);

    program
        .command('deploy-all')
        .description(
            'deploy all contracts and set up roles to network set in .env'
        )
        .action(deployAll);

    program
        .command('deploy-specific')
        .description('deploy specific contracts')
        .argument(
            '<contractName>',
            'the name of the contract to deploy (DLCManager, BTCNFT, etc.)'
        )
        .action(deploySpecific);

    program
        .command('mint-stablecoin')
        .description('mint USDLC')
        .argument('<addressTo>', 'address to mint to')
        .argument('[amount]', 'amount to mint (no extra decimals needed)', 1000)
        .argument('[privateKey]', 'private key of the address to mint from')
        .action(mintStablecoin);

    program
        .command('add-role-to-manager')
        .description('grant role to grantRoleToAddress on DLCManager contract')
        .argument('[role]', 'the role to grant', 'DLC_ADMIN_ROLE')
        .argument(
            '[grantRoleToAddress]',
            'the recipient of the role',
            process.env.OBSERVER_ADDRESS
        )
        .action(addRoleToManager);

    program
        .command('add-role-to-btcnft')
        .description('grant role to grantRoleToAddress on BTCNFT contract')
        .argument('[role]', 'the role to grant', 'MINTER_ROLE')
        .argument(
            '[grantRoleToAddress]',
            'the recipient of the role',
            process.env.OBSERVER_ADDRESS
        )
        .action(addRoleToBtcNft);

    program
        .command('setup-loan')
        .description('setup a loan')
        .argument('[btcDeposit]', 'amount of BTC to deposit in sats', 100000000)
        .argument('[liquidationRatio]', 'liquidation ratio', 14000)
        .argument('[liquidationFee]', 'liquidation fee', 1000)
        .argument('[emergencyRefundTime]', 'emergency refund time', 5)
        .action(lendingSetupLoan);

    program
        .command('close-loan')
        .description('close a loan')
        .argument('<loanID>', 'loan ID')
        .action(lendingCloseLoan);

    program
        .command('setup-vault')
        .description('setup a vault in the DLCBroker contract')
        .argument('[btcDeposit]', 'amount of BTC to deposit in sats', 100000000)
        .argument('[emergencyRefundTime]', 'emergency refund time', 5)
        .action(nftSetupVault);

    program
        .command('send-eth')
        .description('send ETH to an address')
        .argument('<addressTo>', 'address to send ETH to')
        .argument('[amount]', 'amount to send in ETH', 0.1)
        .action(sendEth);

    program
        .command('send-nft')
        .description('send NFT to an address')
        .argument('<privateKey>', 'privateKey of address to send NFT from')
        .argument('<addressTo>', 'address to send NFT to')
        .argument('<id>', 'NFT ID')
        .action(sendNFT);

    // The hardhat and getconfig modules both expect to be running from the root directory of the project,
    // so we change the current directory to the parent dir of this script file to make things work
    // even if you call dlc-link-eth from elsewhere
    const rootDir = path.join(__dirname, '..');
    process.chdir(rootDir);

    await program.parseAsync(process.argv);
}

// ---- main entry point when running as a script

// make sure we catch all errors
main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
