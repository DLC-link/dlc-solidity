const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');

async function pauseOrUnpauseManager(pause) {
    const fn = pause ? 'pauseContract' : 'unpauseContract';
    await callManagerContractFunction(fn, []);
}

async function pauseManager() {
    await pauseOrUnpauseManager(true);
}

async function unpauseManager() {
    await pauseOrUnpauseManager(false);
}

module.exports = { pauseManager, unpauseManager };
