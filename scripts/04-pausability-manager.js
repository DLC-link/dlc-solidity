const {
    callManagerContractFunction,
} = require('./helpers/00-call-dlc-manager-fn');
const {
    callTokenManagerFunction,
} = require('./helpers/10-call-token-manager-fn');

async function pauseOrUnpauseManager(pause) {
    const fn = pause ? 'pauseContract' : 'unpauseContract';
    await callManagerContractFunction(fn, []);
}

async function pauseOrUnpauseTokenManager(pause) {
    const fn = pause ? 'pauseContract' : 'unpauseContract';
    await callTokenManagerFunction(fn, []);
}

async function pauseManager() {
    await pauseOrUnpauseManager(true);
}

async function unpauseManager() {
    await pauseOrUnpauseManager(false);
}

async function pauseTokenManager() {
    await pauseOrUnpauseTokenManager(true);
}

async function unpauseTokenManager() {
    await pauseOrUnpauseTokenManager(false);
}

module.exports = {
    pauseManager,
    unpauseManager,
    pauseTokenManager,
    unpauseTokenManager,
};
