const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

module.exports = async function whitelistAccount(addressToWhitelist, version) {
    await callTokenManagerFunction(
        'whitelistAddress',
        [addressToWhitelist],
        version
    );
};
