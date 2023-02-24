/** @type import('hardhat/config').HardhatUserConfig */

require('@nomicfoundation/hardhat-toolbox');
require('@openzeppelin/hardhat-upgrades');
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomiclabs/hardhat-solhint');
require('@nomiclabs/hardhat-etherscan');

// require('hardhat-ethernal');
require('dotenv').config();

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
      url: process.env['NODE_URL'],
      accounts: [process.env['KEY']],
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env['ETHERSCAN_API_KEY'],
  },

  // ethernal: {
  //   email: process.env.ETHERNAL_EMAIL,
  //   password: process.env.ETHERNAL_PASSWORD
  // }
};
