#!/bin/bash

# Check if the command line argument is provided
if [ $# -eq 0 ]; then
  echo "Please provide a command argument."
  exit 1
fi

# Assign the command line argument to a variable
command=$1
extra_args="${@:2}"

HARDHAT_NETWORK=base dlc-link-eth $command $extra_args
HARDHAT_NETWORK=arbitrum dlc-link-eth $command $extra_args
HARDHAT_NETWORK=mainnet dlc-link-eth $command $extra_args
