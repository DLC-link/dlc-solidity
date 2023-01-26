/** @type import('hardhat/config').HardhatUserConfig */

require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomiclabs/hardhat-solhint");
require('hardhat-ethernal');
require('dotenv').config();

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    coverage: {
      url: 'http://127.0.0.1:8555',
      gas: 0xfffffffffff,
      gasPrice: 0x01,
    },
  },
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  ethernal: {
    email: process.env.ETHERNAL_EMAIL,
    password: process.env.ETHERNAL_PASSWORD
  }
};
