const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function withdraw(uuid, amount) {
    await callManagerContractFunction('withdraw', [uuid, amount]);
}

module.exports = withdraw;

if (require.main === module) {
    const uuid = process.argv[2];
    const amount = process.argv[3];
    withdraw(uuid, amount).catch(console.error);
}
