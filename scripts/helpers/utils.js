const prompts = require('prompts');
const { loadDeploymentInfo } = require('./deployment-handlers_versioned');

async function promptUser(message) {
    const response = await prompts({
        type: 'confirm',
        name: 'continue',
        message,
        initial: false,
    });
    return response.continue;
}

async function loadContractAddress(requirement, network) {
    const deployment = await loadDeploymentInfo(network, requirement);
    if (!deployment) {
        const shouldContinue = await promptUser(
            `Deployment "${requirement}" not found. Continue?`
        );
        if (!shouldContinue) {
            throw new Error('Deployment aborted by user.');
        }
        return undefined;
    }
    return deployment.contract.address;
}

module.exports = {
    promptUser,
    loadContractAddress,
};
