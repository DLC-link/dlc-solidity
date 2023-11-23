const hardhat = require('hardhat');
const { deploymentInfo } = require('./helpers/deployment-handlers_versioned');

async function main() {
    const contractName = 'TokenManager';
    // const proxyAddress = '0xdCfe11Bd5a66aA2E85678f940810A45d6e3c120a';
    const proxyAddress = '0x216904BB9bD5359f819569e4bD495E205B065c35';
    const contractObject = await hardhat.ethers.getContractAt(
        contractName,
        proxyAddress
    );
    deploymentInfo(hardhat, contractObject, contractName);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
