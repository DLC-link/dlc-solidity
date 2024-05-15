const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

async function whitelistAccount(addressToWhitelist) {
    await callTokenManagerFunction('whitelistAddress', [addressToWhitelist]);
}

module.exports = whitelistAccount;

if (require.main === module) {
    const addressToWhitelist = process.argv[2];
    whitelistAccount(addressToWhitelist).catch(console.error);
}
