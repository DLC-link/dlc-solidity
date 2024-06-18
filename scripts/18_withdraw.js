const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

async function withdraw(uuid, amount) {
    await callTokenManagerFunction('withdraw', [uuid, amount]);
}

module.exports = withdraw;

if (require.main === module) {
    const uuid = process.argv[2];
    const amount = process.argv[3];
    withdraw(uuid, amount).catch(console.error);
}
