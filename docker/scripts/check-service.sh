#!/bin/sh
if grep -q "Startup Complete" hardhat.log; then
  exit 0
else
  exit 1
fi
