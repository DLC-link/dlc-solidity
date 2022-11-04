const HDWalletProvider = require('@truffle/hdwallet-provider');
const secrets = require('./secrets.json');

module.exports = {
  networks: {
    goerli: {
      network_id: 5,
      provider: () => {
        return new HDWalletProvider(
          [secrets.key],
          secrets.nodeUrl
        );
      },
      gas: 20000000
    },
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*" // Match any network id
    },
    develop: {
      port: 8545
    }
  },
  api_keys: {
    etherscan: secrets.etherscanApiKey
  },

  plugins: ['truffle-plugin-verify'],

  mocha: {
  },

  compilers: {
    solc: {
      version: "0.8.13",
    }
  },
};
