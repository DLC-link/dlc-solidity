const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function setAttestorGroupPubKey(attestorGPK) {
    await callManagerContractFunction('setAttestorGroupPubKey', [attestorGPK]);
}

module.exports = setAttestorGroupPubKey;

if (require.main === module) {
    const attestorGPK = process.argv[2];
    setAttestorGroupPubKey(attestorGPK).catch(console.error);
}
