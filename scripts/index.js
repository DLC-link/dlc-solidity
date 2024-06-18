#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const { Command } = require('commander');
const version = require('../package.json').version;

const hardhat = require('hardhat');

// DLCManager
const createV1 = require('./01-create-dlc');
const closeV1 = require('./02-close-dlc');
const setStatusFunded = require('./03-set-status-funded');
const {
    grantRoleOnManager,
    registerProtocol,
    addSigner,
} = require('./00-grant-role-on-manager');

const {
    revokeRoleOnManager,
    removeSigner,
} = require('./00-revoke-role-on-manager');
const { pauseManager, unpauseManager } = require('./04-pausability-manager');
const setThreshold = require('./07-set-threshold');
const setTSSCommitment = require('./08-set-tss-commitment');
const setAttestorGroupPubKey = require('./09-set-attestor-gpk');

// TokenManager
const whitelistAccount = require('./10_whitelist-account');
const unwhitelistAccount = require('./11_unwhitelist-account');
const tokenManagerSetupVault = require('./12_setup-vault');
const whitelistingEnabled = require('./13_set-whitelisting');
const setBtcFeeRecipient = require('./14_set-btc-fee-recipient');
const setBTCFee = require('./15_set-btc-fee');
const setDepositLimit = require('./16_set-deposit-limit');
const setMinterOrBurner = require('./17_set-minter-or-burner');

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
        .description('[token-man] whitelist an account')
        .argument('<addressToWhitelist>', 'address to whitelist')
        .action(whitelistAccount);

    program
        .command('unwhitelist-account')
        .description('[token-man] unwhitelist an account')
        .argument('<addressToUnWhitelist>', 'address to unwhitelist')
        .action(unwhitelistAccount);

    program
        .command('setup-vault')
        .description('[token-man] setup a vault')
        .argument('[btcDeposit]', 'amount of BTC to deposit in sats', 1000000)
        .action(tokenManagerSetupVault);

    program
        .command('set-whitelisting')
        .description('[token-man] set whitelisting')
        .argument('<whitelistingEnabled>', 'whitelisting enabled')
        .action(whitelistingEnabled);

    program
        .command('set-btc-fee-recipient')
        .description('[token-man] set BTC fee recipient')
        .argument('<btcFeeRecipient>', 'BTC fee recipient')
        .action(setBtcFeeRecipient);

    program
        .command('set-btc-fee-rate')
        .description('[token-man] set BTC fee rate')
        .argument('<mintOrBurn>', 'mint or burn')
        .argument('<newFee>', 'new fee')
        .action(setBTCFee);

    program
        .command('set-deposit-limit')
        .description('[token-man] set Min/Max deposit limit')
        .argument('<minOrMax>', 'min or max')
        .argument('<newLimit>', 'new limit')
        .action(setDepositLimit);

    program
        .command('set-minter-or-burner')
        .description('[token-man] set minter or burner')
        .argument('<minterOrBurner>', 'minter or burner')
        .argument('<address>', 'address')
        .action(setMinterOrBurner);

    program
        .command('create-dlc')
        .description('[test] create a DLC')
        .argument('[attestorCount]', 'number of attestors', 1)
        .action(createV1);

    program
        .command('close-dlc')
        .description('[test] close a DLC')
        .argument('<uuid>', 'uuid of DLC to close')
        .argument('[outcome]', 'outcome of DLC', 7890)
        .action(closeV1);

    program
        .command('set-status-funded')
        .description('[test] set status to funded for uuid')
        .argument('<uuid>', 'uuid of DLC')
        .action(setStatusFunded);

    // The hardhat and getconfig modules both expect to be running from the root directory of the project,
    // so we change the current directory to the parent dir of this script file to make things work
    // even if you call dlc-link-eth from elsewhere
    const rootDir = path.join(__dirname, '..');
    process.chdir(rootDir);

    console.log(
        'Interacting with network:',
        chalk.bgYellowBright(hardhat.network.name)
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
