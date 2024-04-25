const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

module.exports = async function setBtcFeeRecipient(btcFeeRecipient) {
    await callTokenManagerFunction('setBtcFeeRecipient', [btcFeeRecipient]);
};
