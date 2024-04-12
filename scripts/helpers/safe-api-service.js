const hardhat = require('hardhat');
const { ethers } = require('hardhat');
const Safe = require('@safe-global/protocol-kit').default;
const EthersAdapter = require('@safe-global/protocol-kit').EthersAdapter;
const SafeApiKit = require('@safe-global/api-kit').default;

// This script allows us to wrap txs in a safe contract proposal
// ready to be signed by the safe owners

module.exports = async function safeContractProposal(
    txRequest,
    signer,
    safeAddress
) {
    const network = hardhat.network.name;
    console.log('Network', network);

    const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: signer,
    });

    const txServiceUrl = `https://safe-transaction-${network}.safe.global`;
    const safeService = new SafeApiKit({ txServiceUrl, ethAdapter });

    let nonce = await safeService.getNextNonce(safeAddress);

    const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress: safeAddress,
    });

    console.log('txRequest', txRequest);

    const safeTransactionData = {
        to: txRequest.to,
        data: txRequest.data,
        value: txRequest.value ? txRequest.value.toString() : '0',
        nonce: nonce,
    };

    console.log('safeTransactionData', safeTransactionData);

    const safeTransaction = await safeSdk.createTransaction({
        safeTransactionData,
        options: { nonce },
    });

    console.log('safeTransaction', safeTransaction);

    const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
    console.log('safeTxHash', safeTxHash);
    const senderSignature = await safeSdk.signTransactionHash(safeTxHash);
    console.log('senderSignature', senderSignature);
    await safeService.proposeTransaction({
        safeAddress: safeAddress,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: signer.address,
        senderSignature: senderSignature.data,
        origin: 'script',
    });
};
