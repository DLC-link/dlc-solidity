const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function setBtcFeeRecipient(btcFeeRecipient) {
    await callManagerContractFunction('setBtcFeeRecipient', [btcFeeRecipient]);
}

module.exports = setBtcFeeRecipient;

if (require.main === module) {
    const btcFeeRecipient = process.argv[2];
    setBtcFeeRecipient(btcFeeRecipient).catch(console.error);
}
