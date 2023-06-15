/** @type import('hardhat/config').HardhatUserConfig */

require('@nomicfoundation/hardhat-toolbox');
require('@openzeppelin/hardhat-upgrades');
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomiclabs/hardhat-solhint');
require('@nomiclabs/hardhat-etherscan');
require('solidity-coverage');

require('dotenv').config();

const url = `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;

module.exports = {
    defaultNetwork: 'hardhat',
    solidity: '0.8.17',
    networks: {
        hardhat: {},
        coverage: {
            url: 'http://127.0.0.1:8555',
            gas: 0xfffffffffff,
            gasPrice: 0x01,
        },
        sepolia: {
            url: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: [process.env['KEY']],
        },
        goerli: {
            url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: [process.env['KEY']],
        },
    },
    etherscan: {
        // Your API key for Etherscan
        // Obtain one at https://etherscan.io/
        apiKey: process.env['ETHERSCAN_API_KEY'],
    },
};
