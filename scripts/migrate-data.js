const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const callManagerContractFunction = require('./helpers/00-call-dlc-manager-fn');
const callTokenManagerFunction = require('./helpers/10-call-token-manager-fn');

async function main() {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const deployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'TokenManager'
    );
    const tokenManager = new hardhat.ethers.Contract(
        deployInfo.contract.address,
        deployInfo.contract.abi,
        admin
    );

    const btcFeeRecipient = await tokenManager.btcFeeRecipient();
    const maximumDeposit = await tokenManager.maximumDeposit();
    const minimumDeposit = await tokenManager.minimumDeposit();
    const btcMintFeeRate = await tokenManager.btcMintFeeRate();
    const btcRedeemFeeRate = await tokenManager.btcRedeemFeeRate();
    const dlcBTC = await tokenManager.dlcBTC();
    const whitelistingEnabled = await tokenManager.whitelistingEnabled();

    console.log('TokenManager contract address: ', tokenManager.address);

    console.log('maximumDeposit:', maximumDeposit);
    console.log('minimumDeposit:', minimumDeposit);
    console.log('btcFeeRecipient:', btcFeeRecipient);
    console.log('btcMintFeeRate:', btcMintFeeRate);
    console.log('btcRedeemFeeRate:', btcRedeemFeeRate);
    console.log('dlcBTC:', dlcBTC);
    console.log('whitelistingEnabled:', whitelistingEnabled);

    const deployInfoManager = await loadDeploymentInfo(
        hardhat.network.name,
        'DLCManager'
    );
    const dlcManager = new hardhat.ethers.Contract(
        deployInfoManager.contract.address,
        deployInfoManager.contract.abi,
        admin
    );

    const allVaults = await dlcManager.getAllDLCs(0, 10000);
    // console.log('allVaults:', allVaults);

    const _users = [];
    const _uuids = [];
    const creatorSeen = new Map();
    for (const vault of allVaults) {
        const creator = vault.creator;
        if (creatorSeen.has(creator)) {
            continue;
        }
        creatorSeen.set(creator, true);

        const creatorVaults =
            await tokenManager.getAllVaultUUIDsForAddress(creator);
        console.log('creator:', creator);
        console.log('creatorVaults:', creatorVaults);

        if (!Array.isArray(creatorVaults)) {
            creatorVaults = [creatorVaults]; // Convert to array if not already
        }
        _users.push(creator);
        _uuids.push(creatorVaults);
    }

    console.log('_users:', _users);
    console.log('_uuids:', _uuids);
    await callManagerContractFunction('importData', [
        dlcBTC,
        btcFeeRecipient,
        minimumDeposit,
        maximumDeposit,
        btcMintFeeRate,
        btcRedeemFeeRate,
        whitelistingEnabled,
        _users,
        _uuids,
        _users,
    ]);

    // transfer ownership
    await callTokenManagerFunction('transferTokenContractOwnership', [
        dlcManager.address,
    ]);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
