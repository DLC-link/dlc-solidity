#!/bin/bash

# Can be run after contract deployments for a quick local setup

# Default Hardhat accounts 0, 1, 2
SIGNER1=${ATTESTOR_1_ADDR:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}
SIGNER2=${ATTESTOR_2_ADDR:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}
SIGNER3=${ATTESTOR_3_ADDR:-0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC}

dlc-link-eth add-signer $SIGNER1
dlc-link-eth add-signer $SIGNER2
dlc-link-eth add-signer $SIGNER3

# # TokenManager whitelist turned off
dlc-link-eth set-whitelisting 'false'

# Vault setup and print dlcUUID
# dlc-link-eth setup-vault 1200000 | grep dlcUUID
