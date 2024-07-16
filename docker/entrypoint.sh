#!/bin/sh

# Start the Hardhat node in the background
npx hardhat node >hardhat.log 2>&1 &
mkdir -p deploymentFiles/$NETWORK_NAME 2>/dev/null

# Wait for the Hardhat node to start
while ! grep -q "Started HTTP and WebSocket JSON-RPC server" hardhat.log; do
  echo "Waiting for Hardhat node to start..."
  sleep 1
done

export CLI_MODE='noninteractive'
npx hardhat run --network localhost docker/scripts/deploy-all.js

# Use BTC_FEE_RECIPIENT environment variable
if [ -z "$BTC_FEE_RECIPIENT" ]; then
  $BTC_FEE_RECIPIENT = "03c9fc819e3c26ec4a58639add07f6372e810513f5d3d7374c25c65fdf1aefe4c5"
  exit 1
fi
dlc-link-eth set-btc-fee-recipient $BTC_FEE_RECIPIENT
dlc-link-eth set-attestor-gpk tpubDCFu4tR41DrKFeSrKHvtCy3eojuSwRfxPhGfG6iskApasoWUExBHh7rq21mGXudMycbwZppfVx89ZXMUNrZtFq235fz37Fu1869tWAw1qYi
# push the message "Deployment Complete" into the log file
# NOTE: This is important! It's how the health check finishes
echo "Startup Complete" >>hardhat.log

# Keep the script running so the Docker container doesn't exit
tail -f hardhat.log
