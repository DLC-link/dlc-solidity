#!/bin/bash

# Set CLI_MODE='noninteractive' in the environment
export CLI_MODE='noninteractive'

# Testnet Attestors
dlc-link-eth add-signer 0x3355977947F84C2b1CAE7D2903a72958aEE185e2
dlc-link-eth add-signer 0xA2c975F49f578AC3E384Ad21E2126968b82037f5
dlc-link-eth add-signer 0x3fF31dCd8ca84b594e355CfDf913738bFc192a5c
dlc-link-eth add-signer 0xc5E34272789180802cd7610Ef203EB196CB3522D # Stakin
dlc-link-eth add-signer 0xAE9749CE4616193c7Bf8A1A395Db3C7f910120d6 # LinkPool
dlc-link-eth add-signer 0xABD434AA01eE1A6d3E4a569B871E7e63E64F166c # HashKey
dlc-link-eth add-signer 0x6a79E12566E01e8Fda80a15b7325478B1d68B342 # Despread
dlc-link-eth add-signer 0xB626fa1355B4c64Ca9723D555Bd1AA9eD8491cB4 # ValidationCloud

dlc-link-eth set-whitelisting 'false'

dlc-link-eth set-attestor-gpk 'tpubDDRekL64eJJav32TLhNhG59qra7wAMaei8YMGXNiJE8ksdYrKgvaFM1XG6JrSt31W97XryScrX37RUEujjZT4qScNf8Zu1JxWj4VYkwz4rU'

dlc-link-eth set-btc-fee-recipient 032392b61a5c3b0098774465ad61e429fd892615ff2890f849f8eb237a8a59f3ba

dlc-link-eth set-threshold 4

# Vault setup and print dlcUUID
# dlc-link-eth setup-vault 1200000 | grep dlcUUID
