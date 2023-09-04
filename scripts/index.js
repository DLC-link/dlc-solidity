#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const { Command } = require('commander');
const version = require('../package.json').version;
const mintStablecoin = require('./01_mint-usdc');
const addRoleToManager = require('./02_add-role-to-manager');
const addRoleToBtcNft = require('./03_add-role-to-btcnft');
const lendingSetupLoan = require('./04_lending-setup-loan');
const lendingCloseLoan = require('./05_lending-close-loan');
const sendEth = require('./08_send-eth');
const sendNFT = require('./09_send-nft');
const deployV1 = require('./10_deploy-V1');
const setupV1 = require('./12_V1-setup');
const createV1 = require('./13_V1-create-dlc');
const closeV1 = require('./14_V1-close-dlc');
const setupVault = require('./15_V1-setup-vault');

const addAttestor = require('./12_a_V1-add-attestor');
const removeAttestor = require('./12_ab_V1-remove-attestor');
const registerProtocol = require('./12_b_V1-register-protocol');

async function main() {
    const program = new Command();

    program
        .name('dlc-link-eth')
        .description('CLI scripts to help with DLC.Link utilities')
        .version(`${version}`);

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
            process.env.ADMIN_ADDRESS
        )
        .action(addRoleToManager);

    program
        .command('add-role-to-btcnft')
        .description('grant role to grantRoleToAddress on BTCNFT contract')
        .argument('[role]', 'the role to grant', 'MINTER_ROLE')
        .argument(
            '[grantRoleToAddress]',
            'the recipient of the role',
            process.env.ADMIN_ADDRESS
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

    program
        .command('deploy-v1')
        .description('deploy V1 contracts')
        .argument('[version]', 'version to deploy', 'v1')
        .action(deployV1);

    program
        .command('add-attestor')
        .description('add attestor')
        .argument('<address>', 'address of attestor')
        .action(addAttestor);

    program
        .command('remove-attestor')
        .description('remove attestor')
        .argument('<address>', 'address of attestor')
        .action(removeAttestor);

    program
        .command('register-protocol')
        .description('register protocol contract')
        .argument('<contractAddress>', 'address of protocol contract')
        .argument('<walletAddress>', 'address of protocol wallet')
        .action(registerProtocol);

    program
        .command('setup-v1')
        .description('add attestors and register protocolContract')
        .action(setupV1);

    program
        .command('create-dlc-v1')
        .description('create a DLC')
        .argument('[attestorCount]', 'number of attestors', 1)
        .action(createV1);

    program
        .command('close-dlc-v1')
        .description('close a DLC')
        .argument('<uuid>', 'uuid of DLC to close')
        .argument('[outcome]', 'outcome of DLC', 7890)
        .action(closeV1);

    program
        .command('setup-vault-v1')
        .description('setup a vault on the DLCBroker contract')
        .argument('[btcDeposit]', 'amount of BTC to deposit in sats', 100000000)
        .argument('[attestorCount]', 'number of attestors', 1)
        .argument('[setFunded]', 'simulate funding', false)
        .action(setupVault);

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
