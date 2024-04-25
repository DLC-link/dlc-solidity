const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

module.exports = async function whitelistAccount(addressToWhitelist) {
    await callTokenManagerFunction('whitelistAddress', [addressToWhitelist]);
};
