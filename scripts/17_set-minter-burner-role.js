const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

async function setBurnerOrMinter(burnerOrMinter, address) {
    let functionToCall;
    if (burnerOrMinter === 'minter') {
        functionToCall = 'setMinterOnTokenContract';
    } else if (burnerOrMinter === 'burner') {
        functionToCall = 'setBurnerOnTokenContract';
    } else {
        throw new Error('Invalid burnerOrMinter argument');
    }
    await callTokenManagerFunction(functionToCall, [address]);
}

module.exports = setBurnerOrMinter;

if (require.main === module) {
    const burnerOrMinter = process.argv[2];
    const address = process.argv[3];
    setBurnerOrMinter(burnerOrMinter, address).catch(console.error);
}
