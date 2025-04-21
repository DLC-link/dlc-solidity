#!/bin/bash

# Set CLI_MODE='noninteractive' in the environment
export CLI_MODE='noninteractive'

# Testnet Attestors
dlc-link-eth add-signer 0x3355977947F84C2b1CAE7D2903a72958aEE185e2
dlc-link-eth add-signer 0xA2c975F49f578AC3E384Ad21E2126968b82037f5
dlc-link-eth add-signer 0xAE9749CE4616193c7Bf8A1A395Db3C7f910120d6 # LinkPool
dlc-link-eth add-signer 0xABD434AA01eE1A6d3E4a569B871E7e63E64F166c # HashKey
dlc-link-eth add-signer 0x6a79E12566E01e8Fda80a15b7325478B1d68B342 # Despread
dlc-link-eth add-signer 0xB626fa1355B4c64Ca9723D555Bd1AA9eD8491cB4 # ValidationCloud
dlc-link-eth add-signer 0xec32836897C40dc29525db3bAfBAC18e62fab363 # Nethermind
dlc-link-eth add-signer 0x48256F198CE3A0B9E4f145d8Aa791ECCd768a8a0 # DSRV
dlc-link-eth add-signer 0x163269bDD306884FA4e6a71027F065604227f3c5 # P2P

dlc-link-eth set-whitelisting 'false'

dlc-link-eth set-attestor-gpk 'tpubDDRekL64eJJav32TLhNhG59qra7wAMaei8YMGXNiJE8ksdYrKgvaFM1XG6JrSt31W97XryScrX37RUEujjZT4qScNf8Zu1JxWj4VYkwz4rU'

dlc-link-eth set-btc-fee-recipient tb1q728vrglrmupypwv9st98w48xjj8fh7fs8mrdre

dlc-link-eth set-threshold 4
