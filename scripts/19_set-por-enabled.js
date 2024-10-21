const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function setPoREnabled(enabled) {
    const toSet = enabled === 'true' ? true : false;
    await callManagerContractFunction('setPorEnabled', [toSet]);
}

module.exports = setPoREnabled;

if (require.main === module) {
    const enabled = process.argv[2];
    setPoREnabled(enabled).catch(console.error);
}
