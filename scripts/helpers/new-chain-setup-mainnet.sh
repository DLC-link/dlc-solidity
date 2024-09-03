#!/bin/bash

# Mainnet attestor public keys
dlc-link-eth add-signer 0x989E9c4005ABc2a8E4b85544B44d2d95cfDe08de # DLC.Link
dlc-link-eth add-signer 0xBe4aAE47A62f67bdF93eA9f5F189ae51B1b54492 # DLC.Link
dlc-link-eth add-signer 0x7B254D8C6eBd9662A52180B06920aEA4f23a8940 # DLC.Link
dlc-link-eth add-signer 0x2daef70747eb9E97E5f31A9EBDbda593918F8bE7 # Stakin
dlc-link-eth add-signer 0x2b16469227cd34F591D455aC81Ca8a1A4bA69F02 # LinkPool
dlc-link-eth add-signer 0x5db792d5facb35e9adce8a151e8a3d0d36c9cb77 # HashKey
dlc-link-eth add-signer 0x194c697e8343EaB3C53917BA7e597d02687f8BA0 # Despread
dlc-link-eth add-signer 0xdf4d8B54dE476B674f1832B95984fFa7e223d47B # PierTwo

dlc-link-eth set-attestor-gpk 'xpub6C1F2SwADP3TNajQjg2PaniEGpZLvWdMiFP8ChPjQBRWD1XUBeMdE4YkQYvnNhAYGoZKfcQbsRCefserB5DyJM7R9VR6ce6vLrXHVfeqyH3'

dlc-link-eth set-btc-fee-recipient 021b34f36d8487ce3a7a6f0124f58854d561cb52077593d1e86973fac0fea1a8b1

dlc-link-eth set-threshold 4

# dlc-link-eth grant-role-on-manager DLC_ADMIN_ROLE $MEDIUM_MULTISIG

# other todos:
# - transfer ownership of the proxy admin contract to the DLC.Link multisig
# - transfer ownership of the dlcBTC contract to the DLCManager (this is automated)
# - grant DLC_ADMIN_ROLE role to the DLC.Link MEDIUM multisig
# - renounce DLC_ADMIN_ROLE from the deployer
# - initiate DEFAULT_ADMIN_ROLE transfer on DLCManager to the DLC.Link CRITICAL multisig
# - Fund Coordinator with ETH for gas

# - Whitelist Minters

dlc-link-eth whitelist-account 0x0DD4f29E21F10cb2E485cf9bDAb9F2dD1f240Bfa # DLC.Link
dlc-link-eth whitelist-account 0x5dd42c5fbf7f784d040c59f1720cdd8c47bbff95 # Amber
dlc-link-eth whitelist-account 0xf92893654e38b80dfd9b4a2fb99100dd31ba5e2d # Amber
dlc-link-eth whitelist-account 0xff200709bf9bbc5209ba4b5dd767913a8a06b73f # Amber
dlc-link-eth whitelist-account 0x46166fA874AAEDEA8d98b15F9A72C84e22Abe2A1 # SBL
dlc-link-eth whitelist-account 0x14Ee510Ebd4E5273e83Ad88f6cd2dc228BE40D12 # Tokkalabs
