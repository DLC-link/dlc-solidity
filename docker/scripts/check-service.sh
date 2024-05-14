#!/bin/sh
if grep -q "Deployment Complete" hardhat.log; then
  exit 0
else
  exit 1
fi
