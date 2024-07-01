const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function setMinterOrBurner(minterOrBurner, address) {
    let functionToCall;
    if (minterOrBurner === 'minter') {
        functionToCall = 'setMinterOnTokenContract';
    } else if (minterOrBurner === 'burner') {
        functionToCall = 'setBurnerOnTokenContract';
    } else {
        throw new Error('Invalid minterOrBurner argument');
    }
    await callManagerContractFunction(functionToCall, [address]);
}

module.exports = setMinterOrBurner;

if (require.main === module) {
    const minterOrBurner = process.argv[2];
    const address = process.argv[3];
    setMinterOrBurner(minterOrBurner, address).catch(console.error);
}
