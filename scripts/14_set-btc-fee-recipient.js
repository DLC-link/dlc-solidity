const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

async function setBtcFeeRecipient(btcFeeRecipient) {
    await callTokenManagerFunction('setBtcFeeRecipient', [btcFeeRecipient]);
}

module.exports = setBtcFeeRecipient;

if (require.main === module) {
    const btcFeeRecipient = process.argv[2];
    setBtcFeeRecipient(btcFeeRecipient).catch(console.error);
}
