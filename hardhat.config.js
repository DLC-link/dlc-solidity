/** @type import('hardhat/config').HardhatUserConfig */

require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomiclabs/hardhat-solhint");
// require('hardhat-ethernal');
require('dotenv').config();
const secrets = require('./secrets.json');

module.exports = {
  defaultNetwork: 'hardhat',
  solidity: '0.8.17',
  networks: {
    coverage: {
      url: 'http://127.0.0.1:8555',
      gas: 0xfffffffffff,
      gasPrice: 0x01,
    },
    goerli: {
      url: secrets.nodeUrl,
      accounts: [secrets.key]
    },

  },
  // ethernal: {
  //   email: process.env.ETHERNAL_EMAIL,
  //   password: process.env.ETHERNAL_PASSWORD
  // }
};
