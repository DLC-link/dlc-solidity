const fs = require('fs/promises');
const { execSync } = require('child_process');

function deploymentInfo(networkName, contract, contractName) {
    let _gitSHA;
    try {
        _gitSHA = execSync('git rev-parse --short HEAD').toString().trim();
    } catch (error) {
        _gitSHA = 'N/A';
    }

    const deployInfo = {
        network: networkName,
        updatedAt: new Date().toISOString(),
        gitSHA: _gitSHA,
        contract: {
            name: contractName,
            address: contract.address,
            signerAddress: contract.signer.address,
            abi: contract.interface.format(),
        },
    };
    console.log(deployInfo);
    return deployInfo;
}

async function saveDeploymentInfo(info, filename = undefined) {
    if (!filename) {
        filename = `deploymentFiles/${info.network}/${info.contract.name}.json`;
    }
    console.log(`Writing deployment info to ${filename}`);
    const content = JSON.stringify(info, null, 2) + '\n';
    const dir = filename.substring(0, filename.lastIndexOf('/'));
    try {
        await fs.mkdir(dir, { recursive: true }); // Create the directory path if it doesn't exist
        await fs.writeFile(filename, content, { encoding: 'utf-8' });
    } catch (e) {
        console.error(`Error writing deployment info to ${filename}: ${e}`);
        return false;
    }
    return true;
}

function validateDeploymentInfo(deployInfo) {
    const { contract } = deployInfo;
    if (!contract) {
        throw new Error('required field "contract" not found');
    }
    const required = (arg) => {
        if (!deployInfo.contract.hasOwnProperty(arg)) {
            throw new Error(`required field "contract.${arg}" not found`);
        }
    };
    required('name');
    required('address');
    required('abi');
}

async function loadDeploymentInfo(networkName, contractName) {
    const deploymentConfigFile = `deploymentFiles/${networkName}/${contractName}.json`;
    const content = await fs.readFile(deploymentConfigFile, {
        encoding: 'utf8',
    });
    deployInfo = JSON.parse(content);
    try {
        validateDeploymentInfo(deployInfo);
    } catch (e) {
        throw new Error(
            `error reading deploy info from ${deploymentConfigFile}: ${e.message}`
        );
    }
    return deployInfo;
}

async function fileExists(path) {
    try {
        await fs.access(path, F_OK);
        return true;
    } catch (e) {
        return false;
    }
}

async function confirmOverwrite(filename) {
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'overwrite',
            message: `File ${filename} exists. Overwrite it?`,
            default: false,
        },
    ]);
    return answers.overwrite;
}

module.exports = {
    deploymentInfo,
    saveDeploymentInfo,
    validateDeploymentInfo,
    loadDeploymentInfo,
    fileExists,
    confirmOverwrite,
};
