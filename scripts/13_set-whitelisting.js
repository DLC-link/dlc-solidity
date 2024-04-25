const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

module.exports = async function setWhitelisting(whitelistingEnabled) {
    const toSet = whitelistingEnabled === 'true' ? true : false;
    await callTokenManagerFunction('setWhitelistingEnabled', [toSet]);
};
