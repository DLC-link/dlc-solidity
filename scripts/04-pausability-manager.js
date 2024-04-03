const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function pauseOrUnpauseManager(pause, version) {
    const fn = pause ? 'pauseContract' : 'unpauseContract';
    await callManagerContractFunction(fn, [], version);
}

async function pauseManager(version) {
    await pauseOrUnpauseManager(true, version);
}

async function unpauseManager(version) {
    await pauseOrUnpauseManager(false, version);
}

module.exports = { pauseManager, unpauseManager };
