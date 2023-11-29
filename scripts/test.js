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
    const contractName = 'TokenManager';
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

    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];

    const network = hardhat.network.name;
    console.log('Network', network);
    const safeAddress = dlcAdminSafes[network];

    const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: admin,
    });

    const txServiceUrl = `https://safe-transaction-${network}.safe.global`;
    const safeService = new SafeApiKit({ txServiceUrl, ethAdapter });

    const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress: safeAddress,
    });

    const nonce = await safeService.getNextNonce(safeAddress);
    console.log('nonce', nonce);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
