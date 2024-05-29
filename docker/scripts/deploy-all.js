require('dotenv').config();
const prompts = require('prompts');
const hardhat = require('hardhat');
const getContractConfigs = require('../../scripts/99_contract-configs');
const dlcAdminSafesConfigs = require('../../scripts/helpers/dlc-admin-safes');
const addSigner = require('../../scripts/00-grant-role-on-manager').addSigner;
const setWhitelisting = require('../../scripts/13_set-whitelisting');
const { loadContractAddress } = require('../../scripts/helpers/utils');

prompts.inject([true, true, true, true, true, true]);

async function main() {
    const network = hardhat.network.name;
    const accounts = await hardhat.ethers.getSigners();
    const deployer = accounts[0];
    const dlcAdminSafes = dlcAdminSafesConfigs[network];

    console.log(network, dlcAdminSafes);

    if (!dlcAdminSafes) throw new Error('DLC Admin Safe address not found.');

    const contractConfigs = getContractConfigs(
        {
            deployer,
            dlcAdminSafes,
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
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
        '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
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
