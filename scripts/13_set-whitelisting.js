const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

async function setWhitelisting(whitelistingEnabled) {
    const toSet = whitelistingEnabled === 'true' ? true : false;
    await callTokenManagerFunction('setWhitelistingEnabled', [toSet]);
}

module.exports = setWhitelisting;

if (require.main === module) {
    const whitelistingEnabled = process.argv[2];
    setWhitelisting(whitelistingEnabled).catch(console.error);
}
