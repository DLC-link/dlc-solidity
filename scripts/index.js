#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const { Command } = require('commander');
const version = require('../package.json').version;
const mintStablecoin = require('./demos/01_mint-usdc');
const addRoleToManager = require('./00-grant-role-on-manager');
const addRoleToBtcNft = require('./demos/03_add-role-to-btcnft');
const lendingSetupLoan = require('./demos/04_lending-setup-loan');
const lendingCloseLoan = require('./demos/05_lending-close-loan');
const lendingSetWallet = require('./demos/06_lending-set-wallet');
const sendEth = require('./demos/08_send-eth');
const sendNFT = require('./demos/09_send-nft');
const createV1 = require('./01-create-dlc');
const closeV1 = require('./02-close-dlc');
const setupVault = require('./demos/15_V1-setup-vault');
const setStatusFunded = require('./03-set-status-funded');
const registerProtocol = require('./04-register-protocol');

const contractAdmin = require('./50_contract-admin');

// const safeContractProposal = require('./helpers/safe-api-service');

async function main() {
    const program = new Command();

    program.version(`${version}`);

    program
        .name('dlc-link-eth')
        .description('CLI scripts to help with DLC.Link utilities')
        .version(`${version}`);

    program
        .command('contract-admin')
        .description('[admin] interactive admin tools')
        .argument('[version]', 'version of contracts', 'v1')
        .action(contractAdmin);

    program
        .command('grant-role-on-manager')
        .description('[admin] grant role on DLCManager')
        .argument('[role]', 'the role to grant', 'DLC_ADMIN_ROLE')
        .argument(
            '[grantRoleToAddress]',
            'the recipient of the role',
            process.env.ADMIN_ADDRESS
        )
        .argument('[version]', 'version of DLCManager contract', 'v1')
        .action(addRoleToManager);

    program
        .command('register-protocol')
        .description('[admin] register protocol contract')
        .argument('<contractAddress>', 'address of protocol contract')
        .argument('<walletAddress>', 'address of protocol wallet')
        .argument('[version]', 'version of DLCManager contract', 'v1')
        .action(registerProtocol);

    program
        .command('create-dlc')
        .description('[test] create a DLC')
        .argument('[attestorCount]', 'number of attestors', 1)
        .argument('[version]', 'version of DLCManager contract', 'v1')
        .action(createV1);

    program
        .command('close-dlc')
        .description('[test] close a DLC')
        .argument('<uuid>', 'uuid of DLC to close')
        .argument('[outcome]', 'outcome of DLC', 7890)
        .argument('[version]', 'version of DLCManager contract', 'v1')
        .action(closeV1);

    program
        .command('set-status-funded')
        .description('[test] set status to funded for uuid')
        .argument('<uuid>', 'uuid of DLC')
        .argument('[version]', 'version of DLCManager contract', 'v1')
        .action(setStatusFunded);

    program
        .command('send-eth')
        .description('[util] send ETH to an address')
        .argument('<addressTo>', 'address to send ETH to')
        .argument('[amount]', 'amount to send in ETH', 0.1)
        .action(sendEth);

    program
        .command('send-nft')
        .description('[util] send NFT to an address')
        .argument('<privateKey>', 'privateKey of address to send NFT from')
        .argument('<addressTo>', 'address to send NFT to')
        .argument('<id>', 'NFT ID')
        .action(sendNFT);

    program
        .command('setup-loan')
        .description('[demo] setup a loan')
        .argument('[btcDeposit]', 'amount of BTC to deposit in sats', 100000000)
        // .argument('[liquidationRatio]', 'liquidation ratio', 14000)
        // .argument('[liquidationFee]', 'liquidation fee', 1000)
        // .argument('[emergencyRefundTime]', 'emergency refund time', 5)
        .action(lendingSetupLoan);

    program
        .command('close-loan')
        .description('[demo] close a loan')
        .argument('<loanID>', 'loan ID')
        .action(lendingCloseLoan);

    program
        .command('setup-vault')
        .description('[demo] setup a vault on DLCBroker')
        .argument('[btcDeposit]', 'amount of BTC to deposit in sats', 100000000)
        .argument('[attestorCount]', 'number of attestors', 1)
        .argument('[setFunded]', 'simulate funding', false)
        .action(setupVault);

    program
        .command('mint-stablecoin')
        .description('[demo] mint USDLC')
        .argument('<addressTo>', 'address to mint to')
        .argument('[amount]', 'amount to mint (no extra decimals needed)', 1000)
        .argument('[privateKey]', 'private key of the address to mint from')
        .action(mintStablecoin);

    program
        .command('add-role-to-btcnft')
        .description('[demo] grant role on BTCNFT')
        .argument('[role]', 'the role to grant', 'MINTER_ROLE')
        .argument(
            '[grantRoleToAddress]',
            'the recipient of the role',
            process.env.ADMIN_ADDRESS
        )
        .action(addRoleToBtcNft);

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
