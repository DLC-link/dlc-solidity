const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function setBTCFee(mintOrBurn, newFee) {
    let functionToCall;
    if (mintOrBurn === 'mint') {
        functionToCall = 'setBtcMintFeeRate';
    } else if (mintOrBurn === 'burn') {
        functionToCall = 'setBtcRedeemFeeRate';
    } else {
        throw new Error('Invalid mintOrBurn argument');
    }
    await callManagerContractFunction(functionToCall, [newFee]);
}

module.exports = setBTCFee;

if (require.main === module) {
    const mintOrBurn = process.argv[2];
    const newFee = process.argv[3];
    setBTCFee(mintOrBurn, newFee).catch(console.error);
}
