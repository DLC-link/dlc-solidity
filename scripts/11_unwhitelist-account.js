const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

module.exports = async function unwhitelistAccount(
    addressToUnWhitelist,
    version
) {
    await callTokenManagerFunction(
        'unwhitelistAddress',
        [addressToUnWhitelist],
        version
    );
};
