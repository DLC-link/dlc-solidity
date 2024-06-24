const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function unwhitelistAccount(addressToUnWhitelist) {
    await callManagerContractFunction('unwhitelistAddress', [
        addressToUnWhitelist,
    ]);
}

module.exports = unwhitelistAccount;

if (require.main === module) {
    const addressToUnWhitelist = process.argv[2];
    unwhitelistAccount(addressToUnWhitelist).catch(console.error);
}
