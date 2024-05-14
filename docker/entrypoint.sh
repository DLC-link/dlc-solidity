#!/bin/sh

# Start the Hardhat node in the background
npx hardhat node >hardhat.log 2>&1 &
mkdir -p deploymentFiles/localhost 2>/dev/null

# Wait for the Hardhat node to start
while ! grep -q "Started HTTP and WebSocket JSON-RPC server" hardhat.log; do
  echo "Waiting for Hardhat node to start..."
  sleep 1
done

npx hardhat run --network localhost docker/scripts/deploy-all.js

# push the message "Deployment Complete" into the log file
echo "Deployment Complete" >>hardhat.log

# Keep the script running so the Docker container doesn't exit
tail -f hardhat.log
