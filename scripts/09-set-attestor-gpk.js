const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

module.exports = async function setAttestorGroupPubKey(attestorGPK) {
    await callManagerContractFunction('setAttestorGroupPubKey', [attestorGPK]);
};
