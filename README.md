Join our Discord server for news and support!

[![Discord Banner](https://discordapp.com/api/guilds/887360470955208745/widget.png?style=banner2)](https://discord.gg/TtzqyfPCvE)

# DLC Solidity

This repo contains the solidity smart contracts for the DLC.Link infrastructure.

Learn more about [DLCs](https://github.com/DLC-link/dlc-solidity#What-Are-DLCs) and [DLC.Link](https://dlc.link).

## Overview

A DLC is a contract on Bitcoin that enables users to move/lock Bitcoin conditionally. The possible outcomes of a DLC are predefined in 'Announcements' made by the DLC.Link Attestor Layer. An Announcement can then be used to lock bitcoin on the Bitcoin network, and actions regarding this can be taken on an EVM blockchain. The outcome - that is, the value that will be 'attested' to - is supplied by smart contracts too.

This way, any EVM chain can essentially move native Bitcoin in a safe, "bridgeless" way. Ethereum can leverage the power of DLCs, and the trustless Attestor Layer that DLC.Link provides.

Learn more about the whole architecture on the documentation site here:
https://docs.dlc.link/architecture/tech-stack

# Getting Started

## Examples

We have developed a few example applications which uses DLCs.

You can find these examples under the contracts/examples folder. In each folder you will find a README describing the contract, as well as pointing to some frontend JS code where you can find examples of how we use the sample contracts for our web demos.

## Import and Setup

First import the DLCManager contract, and the interface, and construct an object to interact with it.

```solidity
import "github.com/dlc-link/dlc-solidity/contracts/DLCManager.sol";
# Or only the interface:
# import "github.com/dlc-link/dlc-solidity/contracts/IDLCManager.sol";

import "github.com/dlc-link/dlc-solidity/contracts/DLCLinkCompatible.sol";

// Inherit from DLCLinkCompatible in your contract definition
contract ProtocolContract is DLCLinkCompatible {

// In your constructor, create your DLCManager instance, pointing to our public contract.
DLCManager _dlcManager = DLCManager(publcDLCManagerContractAddress);
```

## Opening a DLC

When you register a DLC with this contract using the `createDLC` function, a DLC Announcement is created on the Bitcoin Attestor Layer (DLC Oracles).

`refundDelay` is the amount of time in seconds to wait from the maturation of the DLC announcement until the DLC can be refunded on Bitcoin. Setting this value to 0 will essentially disable this functionality (setting it to a very long time into the future).

With the announcement hash, you are now able to set up the DLC between the two participants on Bitcoin (users, user/protocol, etc.) This is done via a DLC-enabled BTC wallet. See the section on leveraging DLC-enabled BTC wallets here to learn more: https://docs.dlc.link/architecture/installation-and-setup/bitcoin-wallets

```solidity
// createDLC: Creates the DLC in the DLC Manager contract, as well as in the Oracle network.
//
bytes32 dlcUUID = _dlcManager.createDLC(address _protocolWallet, uint256 _valueLocked, uint256 refundDelay);
```

## Overrides

The following functions can be overridden from the DLCLinkCompatible contract for various DLC functionality.

```solidity

// Overwrite this function to run custom logic when the contract (DLC) on Bitcoin has been funded
function setStatusFunded(bytes32 uuid, string btcTxId) external;

// Called after successful DLC closing
function postCloseDLCHandler(bytes32 uuid, string btcTxId) external;

```

## Closing the DLC

Finally, the contract can call close on the DLCManager with the UUID of the contract to create the DLC attestation and close the Bitcoin contract. At this point, the funds will get sent out of the Bitcoin contract and sent back to the participants' BTC wallets in the ratio set in the close function.

```solidity
// Close the DLC, which sends the collateral out of the Bitcoin DLC at the given ratio.
//
// @parameters
// outcome: Number between 0 and 10000 representing the % of bitcoin paid out from the DLC to the original participants (two decimals precision)
//              0 means the user gets all the collateral, 100.00 means this contract gets all the collateral.
 _dlcManager.closeDLC(dlcUUID, outcome);

 // Overwrite this function to complete the close DLC logic
function postCloseDLCHandler(bytes32 uuid) external;
```

# Contributing

We are happy to have support and contribution from the community. Please find us on Discord and see below for developer details.

## Setup

For reference, you can find samples of the deployed contract by checking the deploymentFiles directory in this project.

Add a `.env` file with the following fields:

```bash
NODE_URL="https://goerli.infura.io/v3/<PROJECT_ID>" # needed for deploying
INFURA_PROJECT_ID="<PROJECT_ID>" # needed for deploying
KEY="<ETH_PRIVATE_KEY>" # needed for deploying
ETHERSCAN_API_KEY="<ETHERSCAN_API_KEY>" # only needed for submitting the contract to etherscan
HARDHAT_NETWORK=goerli # set network as needed
```

# Dev notes:

Create a `.env` based on the `.env.template` fields.
Be sure to set the correct `HARDHAT_NETWORK` for the scripts to work properly. (Set 'localhost' when using hardhat).

To start local hardhat node:

```bash
npx hardhat node
```

Alternatively to run a local hardhat node and IPFS instance too:

```bash
./start-local-environment.sh
```

## Scripts

In the `scripts` directory you will find various helper scripts.

The easiest way to use them is by running the package:

```bash
# If the following throws a 'command not found: dlc-link-eth' error, try running 'npm link' after 'npm i' to set up the symlink for your $PATH

# To see help:
dlc-link-eth --help
# For example for contract deployment and admin scripts:
dlc-link-eth contract-admin
```

Note that properly testing the entire DLC creation flow requires more of the DLC.Link infrastructure running -- but contract-integration can still be tested thoroughly and easily:

## Testing

### With Hardhat

---

```
npx hardhat test
```

\*optionally, `--parallel` to speed this up a bit.

Modify the `hardhat.config.js` for more testing / deployment options.

### Coverage

```
npx hardhat coverage
```

### Static Analysis

In the root folder, run:

```
slither .
```

# What Are DLCs

[Discreet Log Contracts](https://dci.mit.edu/smart-contracts) (DLCs) facilitate conditional payments on Bitcoin between two or more parties. By creating a Discreet Log Contract, two parties can form a monetary contract redistributing their funds to each other without revealing any details to the blockchain. Its appearance on the Bitcoin blockchain will be no different than an ordinary multi-signature output, so no external observer can learn its existence or details from the public ledger. A DLC is similar to a 2-of-3 multisig transaction where the third participant is an “oracle”. An oracle is a 3rd party source of data or information that the parties to the DLC trust as the source of truth for the contract. The oracle is incentivized to be a fair arbiter of the contract.

# About DLC Link

DLC.Link is building infrastructure to empower decentralized applications and smart contract developers to easily leverage the power of DLCs. We provide companies and applications with a traditional REST API and a smart contract interface to create and manage DLCs for their use cases.

DLCs require an oracle to attest to a specific outcome among the predefined set of outcomes. That means trust.

Why power DLC oracles with smart contracts? By using a smart contract for this task, the implementation of the logic, as well as the data being used, is stamped on the chain, and is _visible and reviewable_ by everyone.

Unlike other DLC Oracle server solutions, DLC.link allows the DLCs to be configured with a simple interface, API or via smart contract, and to act on a wide-set of events and data sources through our decentralized infrastructure.

There are two types of events / data sources supported by DLC.link.

1. Off-chain pricing data, such as the current price of BTC, ETH, etc. In fact, any numeric data from Chainlink Oracle Network is supported.

2. On-chain events, such as a completed transaction, a function call, etc.
