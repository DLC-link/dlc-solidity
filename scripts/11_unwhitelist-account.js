const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

module.exports = async function unwhitelistAccount(addressToUnWhitelist) {
    await callTokenManagerFunction('unwhitelistAddress', [
        addressToUnWhitelist,
    ]);
};
