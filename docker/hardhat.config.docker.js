/** @type import('hardhat/config').HardhatUserConfig */

require('@nomicfoundation/hardhat-toolbox');
require('@openzeppelin/hardhat-upgrades');
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomiclabs/hardhat-solhint');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('solidity-docgen');

require('dotenv').config();

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
    },
};
