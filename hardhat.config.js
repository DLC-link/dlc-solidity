/** @type import('hardhat/config').HardhatUserConfig */

require('@nomicfoundation/hardhat-toolbox');
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-solhint');
require('dotenv').config();

const mainnetURL =
    process.env.MAINNET_NODE_ADDR ??
    `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const sepoliaURL =
    process.env.SEPOLIA_NODE_ADDR ??
    `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const holeskyURL =
    process.env.HOLESKY_NODE_ADDR ??
    `https://eth-holesky.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const arbitrumURL =
    process.env.ARB_NODE_ADDR ??
    `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const arbSepoliaURL =
    process.env.ARB_SEPOLIA_NODE_ADDR ??
    `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const baseURL =
    process.env.BASE_NODE_ADDR ??
    `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const baseSepoliaURL =
    process.env.BASE_SEPOLIA_NODE_ADDR ??
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const optimismURL =
    process.env.OPTIMISM_NODE_ADDR ??
    `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const bscURL =
    process.env.BSC_NODE_ADDR ??
    `https://bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const avaxURL =
    process.env.AVAX_NODE_ADDR ??
    `https://avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

const deployerKey = process.env.SCRIPT_KEY ?? process.env.KEY;
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
            url: mainnetURL,
            chainId: 1,
            accounts: [deployerKey],
        },
        sepolia: {
            url: sepoliaURL,
            chainId: 11155111,
            accounts: [deployerKey],
        },
        arbsepolia: {
            url: arbSepoliaURL,
            chainId: 421614,
            accounts: [
                process.env['KEY'],
                process.env['KEY2'],
                process.env['KEY3'],
                deployerKey,
            ],
        },
        holesky: {
            url: holeskyURL,
            chainId: 17000,
            accounts: [deployerKey],
        },
        arbitrum: {
            url: arbitrumURL,
            chainId: 42161,
            accounts: [deployerKey],
        },
        optimism: {
            url: optimismURL,
            chainId: 10,
            accounts: [deployerKey],
        },
        base: {
            url: baseURL,
            chainId: 8453,
            accounts: [deployerKey],
        },
        basesepolia: {
            url: baseSepoliaURL,
            chainId: 84532,
            accounts: [deployerKey],
        },
        bsc: {
            url: bscURL,
            chainId: 56,
            accounts: [deployerKey],
        },
        avax: {
            url: avaxURL,
            chainId: 43114,
            accounts: [deployerKey],
        },
    },
    etherscan: {
        apiKey: {
            arbitrum: process.env['ARBISCAN_API_KEY'],
            arbsepolia: process.env['ARBISCAN_API_KEY'],
            mainnet: process.env['ETHERSCAN_API_KEY'],
            sepolia: process.env['ETHERSCAN_API_KEY'],
            holesky: process.env['ETHERSCAN_API_KEY'],
            optimism: process.env['OPTISCAN_API_KEY'],
            base: process.env['BASESCAN_API_KEY'],
            basesepolia: process.env['BASESCAN_API_KEY'],
            bsc: process.env['BSCSCAN_API_KEY'],
            avax: 'N/A',
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
            {
                network: 'sepolia',
                chainId: 11155111,
                urls: {
                    apiURL: `https://api-sepolia.etherscan.io/api?apikey=${process.env.ETHERSCAN_API_KEY}`,
                    browserURL: 'https://sepolia.etherscan.io',
                },
            },
            {
                network: 'holesky',
                chainId: 17000,
                urls: {
                    apiURL: `https://api-holesky.etherscan.io/api?apikey=${process.env.ETHERSCAN_API_KEY}`,
                    browserURL: 'https://holesky.etherscan.io',
                },
            },
            {
                network: 'optimism',
                chainId: 10,
                urls: {
                    apiURL: `https://api-optimistic.etherscan.io/api?apikey=${process.env.OPTISCAN_API_KEY}`,
                    browserURL: 'https://optimistic.etherscan.io/',
                },
            },
            {
                network: 'base',
                chainId: 8453,
                urls: {
                    apiURL: `https://api.basescan.org/api?apikey=${process.env.BASESCAN_API_KEY}`,
                    browserURL: 'https://basescan.org/',
                },
            },
            {
                network: 'basesepolia',
                chainId: 84532,
                urls: {
                    apiURL: `https://api-sepolia.basescan.org/api?apikey=${process.env.BASESCAN_API_KEY}`,
                    browserURL: 'https://sepolia.basescan.org/',
                },
            },
            {
                network: 'bsc',
                chainId: 56,
                urls: {
                    apiURL: `https://api.bscscan.com/api?apikey=${process.env.BSCSCAN_API_KEY}`,
                    browserURL: 'https://bscscan.com/',
                },
            },
            {
                network: 'avax',
                chainId: 43114,
                urls: {
                    apiURL: `https://api.avascan.info/v2/network/mainnet/evm/43114/etherscan`,
                    browserURL: 'https://avascan.info/blockchain/c',
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
