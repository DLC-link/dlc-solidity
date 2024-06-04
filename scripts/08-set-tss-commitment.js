const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');
const { ethers } = require('ethers');
const hardhat = require('hardhat');
const prompts = require('prompts');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

async function setTSSCommitment(timestamp) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DLCManager'
    );
    const contract = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        admin
    );

    const currentCommitmentBytes32 = await contract.tssCommitment();
    console.log('Current Commitment: ', currentCommitmentBytes32);
    const currentCommitment = ethers.utils.parseBytes32String(
        currentCommitmentBytes32
    );
    console.log('Current Commitment (string): ', currentCommitment);

    let commitment, commitmentBytes32;

    if (timestamp) {
        commitment = timestamp;
        commitmentBytes32 = ethers.utils.formatBytes32String(
            commitment.toString()
        );
    } else {
        const response = await prompts({
            type: 'select',
            name: 'set-unset',
            message: 'Do you want to set or unset the TSS commitment?',
            choices: [
                { title: 'Set (to Timestamp)', value: 'set' },
                { title: 'Unset (to HashZero)', value: 'unset' },
            ],
        });

        if (response['set-unset'] === 'unset') {
            commitment = ethers.constants.HashZero;
            commitmentBytes32 = ethers.constants.HashZero;
        } else if (response['set-unset'] === 'set') {
            // lets make the commitment a UNIX timestamp in seconds
            commitment = Math.floor(Date.now() / 1000);
            // Convert the number to a string and then to bytes32
            commitmentBytes32 = ethers.utils.formatBytes32String(
                commitment.toString()
            );
        } else {
            console.log('No action taken');
            return;
        }
    }

    console.log('Commitment: ', commitment.toString());
    console.log('Commitment (bytes32): ', commitmentBytes32);

    await callManagerContractFunction('setTSSCommitment', [commitmentBytes32]);
}

module.exports = setTSSCommitment;

if (require.main === module) {
    const timestamp = process.argv[2];
    setTSSCommitment(timestamp).catch(console.error);
}
