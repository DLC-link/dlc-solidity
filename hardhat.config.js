/** @type import('hardhat/config').HardhatUserConfig */

require('@nomicfoundation/hardhat-toolbox');
require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-solhint');
require('solidity-coverage');
require('dotenv').config();

const arbitrumURL = process.env.ARB_NODE_ADDR ?? 'https://arb1.arbitrum.io/rpc';
const arbSepoliaURL =
    process.env.ARB_SEPOLIA_NODE_ADDR ??
    'https://sepolia-rollup.arbitrum.io/rpc';

const arbDeployerKey = process.env.ARB_DEPLOYER ?? process.env.KEY;
const keyForSafe = process.env.KEY_FOR_SAFE ?? process.env.KEY;

module.exports = {
    defaultNetwork: 'hardhat',
    solidity: {
        version: '0.8.18',
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
        mainnet: {
            url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: [
                process.env['ARB_DEPLOYER'],
                process.env['KEY2'],
                process.env['KEY3'],
                process.env['KEY_FOR_SAFE'],
            ],
        },
        sepolia: {
            url: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: [
                process.env['KEY'],
                process.env['KEY2'],
                process.env['KEY3'],
                keyForSafe,
            ],
        },
        arbsepolia: {
            url: arbSepoliaURL,
            chainId: 421614,
            accounts: [
                process.env['KEY'],
                process.env['KEY2'],
                process.env['KEY3'],
                keyForSafe,
            ],
        },
        arbitrum: {
            url: arbitrumURL,
            chainId: 42161,
            accounts: [
                arbDeployerKey,
                process.env['KEY2'],
                process.env['KEY3'],
                keyForSafe,
            ],
        },
    },
    etherscan: {
        apiKey: {
            arbitrum: process.env['ARBISCAN_API_KEY'],
            arbsepolia: process.env['ARBISCAN_API_KEY'],
            mainnet: process.env['ETHERSCAN_API_KEY'],
        },
        customChains: [
            {
                network: 'arbsepolia',
                chainId: 421614,
                urls: {
                    apiURL: `https://api-sepolia.arbiscan.io/api?apikey=${process.env.ARBISCAN_API_KEY}`,
                    browserURL: 'https://sepolia.arbiscan.io',
                },
            },
            {
                network: 'arbitrum',
                chainId: 42161,
                urls: {
                    apiURL: `https://api.arbiscan.io/api?apikey=${process.env.ARBISCAN_API_KEY}`,
                    browserURL: 'https://arbiscan.io',
                },
            },
            {
                network: 'mainnet',
                chainId: 1,
                urls: {
                    apiURL: `https://api.etherscan.io/api?apikey=${process.env.ETHERSCAN_API_KEY}`,
                    browserURL: 'https://etherscan.io',
                },
            },
        ],
    },
    gasReporter: {
        currency: 'USD',
        enabled: process.env.REPORT_GAS ? true : false,
        coinmarketcap: process.env['COINMARKETCAP_API_KEY'],
        L2: 'arbitrum',
        L2Etherscan: process.env['ARBISCAN_API_KEY'],
        L1Etherscan: process.env['ETHERSCAN_API_KEY'],
    },
};
