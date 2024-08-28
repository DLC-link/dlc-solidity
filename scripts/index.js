#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const { Command } = require('commander');
const version = require('../package.json').version;

const hardhat = require('hardhat');

// DLCManager
const {
    grantRoleOnManager,
    registerProtocol,
    addSigner,
} = require('./00-grant-role-on-manager');

const {
    revokeRoleOnManager,
    removeSigner,
} = require('./00-revoke-role-on-manager');
const {
    pauseManager,
    unpauseManager,
    pauseTokenManager,
    unpauseTokenManager,
} = require('./04-pausability-manager');
const setThreshold = require('./07-set-threshold');
const setTSSCommitment = require('./08-set-tss-commitment');
const setAttestorGroupPubKey = require('./09-set-attestor-gpk');
const whitelistAccount = require('./10_whitelist-account');
const unwhitelistAccount = require('./11_unwhitelist-account');
const dlcManagerSetupVault = require('./12_setup-vault');
const whitelistingEnabled = require('./13_set-whitelisting');
const setBtcFeeRecipient = require('./14_set-btc-fee-recipient');
const setBTCFee = require('./15_set-btc-fee');
const setDepositLimit = require('./16_set-deposit-limit');
const setMinterOrBurner = require('./17_set-minter-or-burner');
const withdraw = require('./18_withdraw');

const contractAdmin = require('./50_contract-admin');

const fs = require('fs');
const util = require('util');
const chalk = require('chalk');

// Name of the file to save the log messages
const logFileName = 'log.log';

// Save the reference to the original console.log function
const originalConsoleLog = console.log;

// Create a write stream to the log file
const logStream = fs.createWriteStream(path.join(__dirname, logFileName), {
    flags: 'a',
});

// Override the console.log function
console.log = function (...args) {
    // Save the log message to the file
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${util.format(...args)}`;

    // Save the log message to the file
    logStream.write(message + '\n');

    // Call the original console.log function
    originalConsoleLog(...args);
};

// Redirect console.error as well if needed
const originalConsoleError = console.error;
console.error = function (...args) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] [ERROR] ${util.format(...args)}`;

    // Save the error message to the file
    logStream.write(message + '\n');

    originalConsoleError(...args);
};

async function main() {
    const program = new Command();

    program
        .name('dlc-link-eth')
        .description('CLI scripts to help with DLC.Link utilities')
        .version(`${version}`);

    program
        .command('contract-admin')
        .description('[admin] interactive admin tools')
        .action(contractAdmin);

    program
        .command('grant-role-on-manager')
        .description('[admin] grant role on DLCManager')
        .argument('[role]', 'the role to grant', 'DLC_ADMIN_ROLE')
        .argument(
            '[grantRoleToAddress]',
            'the recipient of the role',
            '0xbf7184178d610d7b0239a5cb8d64c1df22d306a9'
        )
        .action(grantRoleOnManager);

    program
        .command('revoke-role-on-manager')
        .description('[admin] revoke role on DLCManager')
        .argument('[role]', 'the role to revoke', 'DLC_ADMIN_ROLE')
        .argument(
            '[grantRoleToAddress]',
            'address to revoke role from',
            '0xbf7184178d610d7b0239a5cb8d64c1df22d306a9'
        )
        .action(grantRoleOnManager);

    program
        .command('register-protocol')
        .description('[admin] register protocol contract')
        .argument('<contractAddress>', 'address of protocol contract')
        .action(registerProtocol);

    program
        .command('add-signer')
        .description('[admin] add signer to DLCManager')
        .argument('<signer>', 'address of signer')
        .action(addSigner);

    program
        .command('remove-signer')
        .description('[admin] remove signer to DLCManager')
        .argument('<signer>', 'address of signer')
        .action(removeSigner);

    program
        .command('pause-manager')
        .description('[admin] pause DLCManager')
        .action(pauseManager);

    program
        .command('unpause-manager')
        .description('[admin] unpause DLCManager')
        .action(unpauseManager);

    program
        .command('pause-token-manager')
        .description('[admin] pause TokenManager')
        .action(pauseTokenManager);

    program
        .command('unpause-token-manager')
        .description('[admin] unpause TokenManager')
        .action(unpauseTokenManager);

    program
        .command('set-threshold')
        .description('[admin] set threshold on DLCManager')
        .argument('<threshold>', 'threshold')
        .action(setThreshold);

    program
        .command('set-tss-commitment')
        .description('[admin] set TSS commitment')
        .argument('[timestamp]', 'timestamp to set')
        .action(setTSSCommitment);

    program
        .command('set-attestor-gpk')
        .description('[admin] set attestor group public key')
        .argument('<attestorGPK>', 'attestor group public key')
        .action(setAttestorGroupPubKey);

    program
        .command('whitelist-account')
        .description('[admin] whitelist an account')
        .argument('<addressToWhitelist>', 'address to whitelist')
        .action(whitelistAccount);

    program
        .command('unwhitelist-account')
        .description('[admin] unwhitelist an account')
        .argument('<addressToUnWhitelist>', 'address to unwhitelist')
        .action(unwhitelistAccount);

    program
        .command('setup-vault')
        .description('[admin] setup a vault')
        .argument('[btcDeposit]', 'amount of BTC to deposit in sats', 1000000)
        .action(dlcManagerSetupVault);

    program
        .command('set-whitelisting')
        .description('[admin] set whitelisting')
        .argument('<whitelistingEnabled>', 'whitelisting enabled')
        .action(whitelistingEnabled);

    program
        .command('set-btc-fee-recipient')
        .description('[admin] set BTC fee recipient')
        .argument('<btcFeeRecipient>', 'BTC fee recipient')
        .action(setBtcFeeRecipient);

    program
        .command('set-btc-fee-rate')
        .description('[admin] set BTC fee rate')
        .argument('<mintOrBurn>', 'mint or burn')
        .argument('<newFee>', 'new fee')
        .action(setBTCFee);

    program
        .command('set-deposit-limit')
        .description('[admin] set Min/Max deposit limit')
        .argument('<minOrMax>', 'min or max')
        .argument('<newLimit>', 'new limit')
        .action(setDepositLimit);

    program
        .command('set-minter-or-burner')
        .description('[admin] set minter or burner')
        .argument('<minterOrBurner>', 'minter or burner')
        .argument('<address>', 'address')
        .action(setMinterOrBurner);

    program
        .command('withdraw')
        .description('[token-man] withdraw some amount')
        .argument('<uuid>', 'UUID of vault')
        .argument('<amount>', 'amount to withdraw')
        .action(withdraw);

    // The hardhat and getconfig modules both expect to be running from the root directory of the project,
    // so we change the current directory to the parent dir of this script file to make things work
    // even if you call dlc-link-eth from elsewhere
    const rootDir = path.join(__dirname, '..');
    process.chdir(rootDir);

    console.log(
        'Interacting with network:',
        chalk.bgYellowBright(process.env.NETWORK_NAME ?? hardhat.network.name)
    );
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
