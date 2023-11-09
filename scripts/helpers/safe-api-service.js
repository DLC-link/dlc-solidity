const { Signer } = require('ethers');
const hardhat = require('hardhat');
const { ethers } = require('hardhat');
const { loadDeploymentInfo } = require('./deployment-handlers_versioned');

const Safe = require('@safe-global/protocol-kit').default;
const EthersAdapter = require('@safe-global/protocol-kit').EthersAdapter;
const SafeFactory = require('@safe-global/protocol-kit').SafeFactory;
const SafeApiKit = require('@safe-global/api-kit').default;

// This script would allow us to wrap txs in a safe contract proposal
// ready to be signed by the safe owners
// This is a work in progress
module.exports = async function safeContractProposal() {
    const network = hardhat.network.name;
    console.log('network', network);
    const accounts = await hardhat.ethers.getSigners();
    const signer = accounts[0];

    const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: signer,
    });

    const txServiceUrl = 'https://safe-transaction-goerli.safe.global';
    const safeService = new SafeApiKit({ txServiceUrl, ethAdapter });

    const safeFactory = await SafeFactory.create({ ethAdapter });
    const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress: '0x7bE48abb024eC70bd3E74521589a94657eF03986',
    });

    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcManager',
        'v1'
    );
    const dlcManager = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        accounts[0]
    );
    const role = 'WHITELISTED_CONTRACT';
    const grantRoleToAddress = accounts[1].address;
    const roleInBytes = hardhat.ethers.utils.id(role);
    console.log('roleInBytes', roleInBytes);

    const txRequest = await dlcManager.populateTransaction.grantRole(
        roleInBytes,
        grantRoleToAddress
    );

    console.log('txRequest', txRequest);

    const safeTransactionData = {
        to: txRequest.to,
        data: txRequest.data,
        value: txRequest.value ? txRequest.value.toString() : '0',
    };

    console.log('safeTransactionData', safeTransactionData);

    const safeTransaction = await safeSdk.createTransaction({
        safeTransactionData,
    });

    console.log('safeTransaction', safeTransaction);

    const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
    console.log('safeTxHash', safeTxHash);
    const senderSignature = await safeSdk.signTransactionHash(safeTxHash);
    console.log('senderSignature', senderSignature);
    await safeService.proposeTransaction({
        safeAddress: '0x7bE48abb024eC70bd3E74521589a94657eF03986',
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: signer.address,
        senderSignature: senderSignature.data,
        origin: 'script',
    });
};
