#!/bin/sh

# Start the Hardhat node in the background
npx hardhat node >hardhat.log 2>&1 &
mkdir -p deploymentFiles/localhost 2>/dev/null
npx hardhat run --network localhost scripts/misc/deploy-all.js
# Keep the script running so the Docker container doesn't exit
tail -f hardhat.log
