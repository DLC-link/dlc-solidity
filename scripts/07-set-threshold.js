const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

module.exports = async function setThreshold(threshold) {
    await callManagerContractFunction('setThreshold', [threshold]);
};
