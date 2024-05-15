const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function setThreshold(threshold) {
    await callManagerContractFunction('setThreshold', [threshold]);
}

module.exports = setThreshold;

if (require.main === module) {
    const threshold = process.argv[2];
    setThreshold(threshold).catch(console.error);
}
