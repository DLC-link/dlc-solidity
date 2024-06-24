const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function setWhitelisting(whitelistingEnabled) {
    const toSet = whitelistingEnabled === 'true' ? true : false;
    await callManagerContractFunction('setWhitelistingEnabled', [toSet]);
}

module.exports = setWhitelisting;

if (require.main === module) {
    const whitelistingEnabled = process.argv[2];
    setWhitelisting(whitelistingEnabled).catch(console.error);
}
