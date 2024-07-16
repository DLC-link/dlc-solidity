require('dotenv').config();
const hardhat = require('hardhat');
const getContractConfigs = require('../../scripts/99_contract-configs');
const dlcAdminSafesConfigs = require('../../scripts/helpers/dlc-admin-safes');
const addSigner = require('../../scripts/00-grant-role-on-manager').addSigner;
const setWhitelisting = require('../../scripts/13_set-whitelisting');
const { loadContractAddress } = require('../../scripts/helpers/utils');

process.env.CLI_MODE = 'noninteractive';

async function main() {
    const network = process.env.NETWORK_NAME ?? 'localhost';
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const dlcAdminSafes = {
        medium: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        critical: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    }; // Hardhat default deployer account

    const contractConfigs = getContractConfigs(
        {
            deployer,
            dlcAdminSafes,
            networkName: network,
        },
        process.env.BTC_FEE_RECIPIENT
    );

    await hardhat.run('compile');

    for (const contractConfig of contractConfigs) {
        const requirements = contractConfig.requirements;
        const reqs = {};
        for (const requirement of requirements) {
            reqs[requirement] = await loadContractAddress(requirement, network);
        }
        await contractConfig.deploy(reqs);
    }

    console.log('Deployment complete');

    // Adding signers
    const defaultSigners = [
        '0x976EA74026E726554dB657fA54763abd0C3a0aa9', // account[6]
        '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955', // account[7]
        '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f', // account[8]
    ];
    for (const signer of defaultSigners) {
        await addSigner(signer);
    }

    // Set whitelisting
    await setWhitelisting('false');
}

// make sure we catch all errors
main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
