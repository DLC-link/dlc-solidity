const hardhat = require('hardhat');
const {
    deploymentInfo,
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const { Signer } = require('ethers');
const { ethers } = require('hardhat');
const dlcAdminSafes = require('./helpers/dlc-admin-safes');

const Safe = require('@safe-global/protocol-kit').default;
const EthersAdapter = require('@safe-global/protocol-kit').EthersAdapter;
const SafeFactory = require('@safe-global/protocol-kit').SafeFactory;
const SafeApiKit = require('@safe-global/api-kit').default;

async function main() {
    // const contractName = 'TokenManager';
    // const proxyAddress = '0xdCfe11Bd5a66aA2E85678f940810A45d6e3c120a';
    // const proxyAddress = '0x216904BB9bD5359f819569e4bD495E205B065c35';
    // const tokenDeployInfo = await loadDeploymentInfo(
    //     hardhat.network.name,
    //     'TokenManager',
    //     'v1'
    // );
    // const contractObject = await hardhat.ethers.getContractAt(
    //     contractName,
    //     tokenDeployInfo.contract.address
    // );

    // const vault = await contractObject.getVault(
    //     '0x00d8e4b2a67a0665d1fdba4fcba7bb699870de4d314326cad295794af8063acf'
    // );

    // console.log(vault);

    // const accounts = await hardhat.ethers.getSigners();
    // const admin = accounts[0];

    // const network = hardhat.network.name;
    // console.log('Network', network);
    // const safeAddress = dlcAdminSafes[network];

    // const ethAdapter = new EthersAdapter({
    //     ethers,
    //     signerOrProvider: admin,
    // });

    // const txServiceUrl = `https://safe-transaction-${network}.safe.global`;
    // const safeService = new SafeApiKit({ txServiceUrl, ethAdapter });

    // const safeSdk = await Safe.create({
    //     ethAdapter,
    //     safeAddress: safeAddress,
    // });

    // const nonce = await safeService.getNextNonce(safeAddress);
    // console.log('nonce', nonce);

    const network = hardhat.network.name;
    console.log('Network', network);

    // deploy the ThresholdSignature contract to local network
    const thresholdSignatureFactory =
        await ethers.getContractFactory('ThresholdSignature');
    const thresholdSignature = await thresholdSignatureFactory.deploy(2, [
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    ]);
    await thresholdSignature.deployed();
    console.log('ThresholdSignature deployed to:', thresholdSignature.address);

    // //////////////////////////////////

    const mockUUID =
        '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967';
    const wrongUUID =
        '0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4968';
    const mockBTCTxId =
        '0x1234567890123456789012345678901234567890123456789012345678901234';

    const signers = [
        new ethers.Wallet(
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
            ethers.provider
        ),
        new ethers.Wallet(
            '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
            ethers.provider
        ),
    ];

    const originalMessage = ethers.utils.solidityPack(
        ['bytes32', 'string'],
        [mockUUID, mockBTCTxId]
    );

    const hashedOriginalMessage = ethers.utils.keccak256(originalMessage);
    const arrayifiedOriginalMessage = ethers.utils.arrayify(
        hashedOriginalMessage
    );

    const prefixedMessageHash = ethers.utils.solidityKeccak256(
        ['string', 'bytes32'],
        ['\x19Ethereum Signed Message:\n32', arrayifiedOriginalMessage]
    );
    // Create signatures

    const signatures = [];
    for (const signer of signers) {
        const signature = await signer.signMessage(
            ethers.utils.arrayify(prefixedMessageHash)
        );
        console.log('signature', signature);
        signatures.push(ethers.utils.arrayify(signature));
    }
    console.log('originalMessage', originalMessage);
    console.log('hashedOriginalMessage', hashedOriginalMessage);
    console.log('arrayifiedOriginalMessage', arrayifiedOriginalMessage);
    console.log('prefixedMessageHash', prefixedMessageHash);
    // console.log('signatures', signatures);

    // NOTE: if you send the wrongUUID, the transaction will revert! Success!
    const tx = await thresholdSignature
        .connect(signers[0])
        .execute(mockUUID, mockBTCTxId, prefixedMessageHash, signatures);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log('receipt: ', receipt);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
