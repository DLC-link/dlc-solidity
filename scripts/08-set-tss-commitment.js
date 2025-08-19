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
        process.env.NETWORK_NAME ?? hardhat.network.name,
        'DLCManager'
    );
    const contract = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        admin
    );

    const currentCommitment = ethers.utils.parseBytes32String(
        await contract.tssCommitment()
    );

    console.log('Current Commitment: ', currentCommitment);

    let commitment;

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
    } else if (response['set-unset'] === 'set') {
        const commitmentType = (
            await prompts({
                type: 'select',
                name: 'commitmentType',
                message: 'Select the commitment type:',
                choices: [
                    { title: 'DKG', value: 'DKG' },
                    { title: 'VSR', value: 'VSR' },
                ],
            })
        ).commitmentType;

        const signerGroupIdentifier = (
            await prompts({
                type: 'select',
                name: 'signerGroup',
                message: 'Select the Signer Group Identifier:',
                choices: [
                    { title: 'Group A', value: 'A' },
                    { title: 'Group B', value: 'B' },
                ],
            })
        ).signerGroup;

        const currentTimestamp = timestamp ?? Math.floor(Date.now() / 1000);

        const commitmentString = `${commitmentType}|${currentTimestamp}|${signerGroupIdentifier}`;

        console.log('New Commitment String: ', commitmentString);

        const stringBytes = ethers.utils.toUtf8Bytes(commitmentString);
        if (stringBytes.length > 32) {
            throw new Error('Commitment string too long for bytes32');
        }

        // Pad with zeros to make it 32 bytes
        const paddedBytes = new Uint8Array(32);
        paddedBytes.set(stringBytes);
        commitment = ethers.utils.hexlify(paddedBytes);
    } else {
        console.log('No action taken');
        return;
    }

    await callManagerContractFunction('setTSSCommitment', [commitment]);
}

module.exports = setTSSCommitment;

if (require.main === module) {
    const timestamp = process.argv[2];
    setTSSCommitment(timestamp).catch(console.error);
}
