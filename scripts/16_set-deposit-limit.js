const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function setDepositLimit(minOrMax, newLimit) {
    let functionToCall;
    if (minOrMax === 'min') {
        functionToCall = 'setMinimumDeposit';
    } else if (minOrMax === 'max') {
        functionToCall = 'setMaximumDeposit';
    } else {
        throw new Error('Invalid minOrMax argument');
    }
    await callManagerContractFunction(functionToCall, [newLimit]);
}

module.exports = setDepositLimit;

if (require.main === module) {
    const minOrMax = process.argv[2];
    const newLimit = process.argv[3];
    setDepositLimit(minOrMax, newLimit).catch(console.error);
}
