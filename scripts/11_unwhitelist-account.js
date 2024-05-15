const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

async function unwhitelistAccount(addressToUnWhitelist) {
    await callTokenManagerFunction('unwhitelistAddress', [
        addressToUnWhitelist,
    ]);
}

module.exports = unwhitelistAccount;

if (require.main === module) {
    const addressToUnWhitelist = process.argv[2];
    unwhitelistAccount(addressToUnWhitelist).catch(console.error);
}
