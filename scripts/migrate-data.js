const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');
const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

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
    ]);

    // transfer ownership
    await callTokenManagerFunction('transferTokenContractOwnership', [
        dlcManager.address,
    ]);

    for (const user of _users) {
        await callManagerContractFunction('whitelistAddress', [user]);

        await callManagerContractFunction('setUserVaultUUIDs', [
            user,
            _uuids[_users.indexOf(user)],
        ]);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
// 0x0DD4f29E21F10cb2E485cf9bDAb9F2dD1f240Bfa,0x7038f8a64cE8F879705A48e962B55d56aEcd60D8,0xbE1075810Ba9C0642F274850194447a062270c26,0xc389e2F03F4FD009B61B905790089f5924e58f70,0x3f7dBc00E7c4BCC8fE2a51B7980928c1F8D36d48,0xDa605defb12Af295EFA6Ec383a139582188Be568,0xDdBE45eb79fa9920340a72020F50fB5b13dd3b6d,0xDeB23F816efC983461B943C5edCC86CBaf832D0D,0xE5e3645585fAdB0B9FDDfbEBd2A9Af7700371f8b,0x0eFd698740eA9Fe8b8899E4c1191F6C6ECAb6c73,0xBf7184178d610D7B0239a5CB8D64c1Df22d306a9
