const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

module.exports = async function setThreshold(threshold, version) {
    await callManagerContractFunction('setThreshold', [threshold], version);
};
