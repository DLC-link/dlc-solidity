/** @type import('hardhat/config').HardhatUserConfig */

require('@nomicfoundation/hardhat-toolbox');
require('@openzeppelin/hardhat-upgrades');
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomiclabs/hardhat-solhint');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('solidity-docgen');

require('dotenv').config();

const url = `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
const gasPriceApi = `https://api.arbiscan.io/api?module=proxy&action=eth_gasPrice&apikey=${process.env.ARBISCAN_API_KEY}`;

module.exports = {
    defaultNetwork: 'hardhat',
    solidity: {
        version: '0.8.17',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: {},
        coverage: {
            url: 'http://127.0.0.1:8555',
            gas: 0xfffffffffff,
            gasPrice: 0x01,
        },
        sepolia: {
            url: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: [
                process.env['KEY'],
                process.env['KEY2'],
                process.env['KEY3'],
                process.env['KEY_FOR_SAFE'],
            ],
        },
        goerli: {
            url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: [
                process.env['KEY'],
                process.env['KEY2'],
                process.env['KEY3'],
                process.env['KEY_FOR_SAFE'],
            ],
        },
        arbitrumGoerli: {
            url: 'https://goerli-rollup.arbitrum.io/rpc',
            chainId: 421613,
            //accounts: [GOERLI_TESTNET_PRIVATE_KEY]
        },
        arbitrumOne: {
            url: 'https://arb1.arbitrum.io/rpc',
            //accounts: [ARBITRUM_MAINNET_TEMPORARY_PRIVATE_KEY]
        },
        x1test: {
            url: 'https://testrpc.x1.tech',
            accounts: [
                process.env['KEY'],
                process.env['KEY2'],
                process.env['KEY3'],
                process.env['KEY_FOR_SAFE'],
            ],
        },
        bobtest: {
            url: 'https://testnet.rpc.gobob.xyz',
            accounts: [
                process.env['KEY'],
                process.env['KEY2'],
                process.env['KEY3'],
                process.env['KEY_FOR_SAFE'],
            ],
        },
    },
    etherscan: {
        // Your API key for Etherscan
        // Obtain one at https://etherscan.io/
        apiKey: process.env['ETHERSCAN_API_KEY'],
        customChains: [
            {
                network: 'bobtest',
                chainId: 111,
                urls: {
                    apiURL: 'https://testnet-explorer.gobob.xyz/api',
                    browserURL: 'https://testnet-explorer.gobob.xyz',
                },
            },
        ],
    },
    gasReporter: {
        currency: 'USD',
        enabled: process.env.REPORT_GAS ? true : false,
        coinmarketcap: process.env['COINMARKETCAP_API_KEY'],
        // gasPriceApi: gasPriceApi,
        // gasPrice: 1,
    },
    docgen: {
        pages: 'files',
        exclude: ['mocks', 'test', 'examples'],
    },
};
