#!/bin/bash

# Can be run after contract deployments for a quick local setup

# Default Hardhat accounts 0, 1, 2
dlc-link-eth add-signer 0x3355977947F84C2b1CAE7D2903a72958aEE185e2
dlc-link-eth add-signer 0xA2c975F49f578AC3E384Ad21E2126968b82037f5
dlc-link-eth add-signer 0x3fF31dCd8ca84b594e355CfDf913738bFc192a5c

# TokenManager whitelist turned off
dlc-link-eth set-whitelisting 'false'

# Vault setup and print dlcUUID
# dlc-link-eth setup-vault 1200000 | grep dlcUUID
