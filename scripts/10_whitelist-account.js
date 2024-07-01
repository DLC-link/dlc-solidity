const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function whitelistAccount(addressToWhitelist) {
    await callManagerContractFunction('whitelistAddress', [addressToWhitelist]);
}

module.exports = whitelistAccount;

if (require.main === module) {
    const addressToWhitelist = process.argv[2];
    whitelistAccount(addressToWhitelist).catch(console.error);
}
