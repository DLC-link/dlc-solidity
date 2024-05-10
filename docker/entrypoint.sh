#!/bin/sh

# Start the Hardhat node in the background
npx hardhat node >hardhat.log 2>&1 &

# Wait for the Hardhat node to be ready
while ! nc -z localhost 8545; do
  sleep 1
done
echo "Hardhat node is ready"

# Run your deployment and initialization scripts
# npx hardhat run --network localhost scripts/deploy.js
# npx hardhat run --network localhost scripts/initialize.js

mkdir deploymentFiles
mkdir deploymentFiles/hardhat
node scripts/misc/deploy-all.js

# Keep the script running so the Docker container doesn't exit
tail -f /dev/null
