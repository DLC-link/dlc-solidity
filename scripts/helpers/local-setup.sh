#!/bin/bash

# Can be run after contract deployments for a quick local setup

# Default Hardhat accounts 0, 1, 2
dlc-link-eth add-signer 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
dlc-link-eth add-signer 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
dlc-link-eth add-signer 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

dlc-link-eth set-whitelisting 'false'

# Vault setup and print dlcUUID
dlc-link-eth setup-vault 1200000 | grep dlcUUID
