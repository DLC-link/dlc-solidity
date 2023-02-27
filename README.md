# DLC Manager Smart Contract

This smart contract is the interface for creating and closing DLCs via the DLC.Link infrastructure. For cases where the DLC requires market prices of assets (e.g. BTC price) this contract is responsible for fetching that (via Chainlink) as part of it's closing criteria.

Learn more about [DLCs](https://github.com/DLC-link/dlc-solidity-smart-contract#What-Are-DLCs) and [dlc.link](https://dlc.link).

## Overview
A DLC requires an oracle to attest to a specific outcome among the predefined set of outcomes. The DLC can then be used to lock bitcoin in a contract on the bitcoin network, and action regarding that bitcoin can be taken on the EVM blockchain. After the DLC is closed, that Bitcoin is moved out of the bitcoin contract and back to the participants in a proportion given in the dlc_close function.

Learn more about the whole architecture on the documentation site here:
https://docs.dlc.link/architecture/tech-stack

# Getting Started

## Examples
We have developed a few example applications which uses DLCs.

You can find these examples under the contracts/examples folder. In each folder you will find a README describing the contract, as well as pointing to some frontend JS code where you can find examples of how we use the sample contracts for our web demos.

## Import and Setup
First import the DLCManager contract, and the interface, and construct an object to interact with it.

```js
import "github.com/dlc-link/dlc-solidity/contracts/DLCManager.sol";
import "github.com/dlc-link/dlc-solidity/contracts/DLCLinkCompatible.sol";

// Inheret from DLCLinkCompatible in your class definition
contract DlcBroker is DLCLinkCompatible {

// In your constructor, create your DLCManager instance, pointing to our public contract.
DLCManager _dlcManager = DLCManager(publcDLCManagerContractAddress);
```

## Opening a DLC
When you register a DLC with this contract using the `createDLC` function, a DLC is opened on the Bitcoin Oracles (DLC Oracles).

With the announcement hash, you are now able to set up the DLC between the two participants on Bitcoin (users, user/protocol, etc.) This is done via a DLC-enabled BTC wallet. See the section on leveraging DLC-enabled BTC wallets here to learn more: https://docs.dlc.link/architecture/installation-and-setup/bitcoin-wallets

```js
// createDLC: Creates the DLC in the DLC Manager contract, as well as in the Oracle network.
//
// @parameters
// emergencyRefundTime: The time at which the DLC can be cancelled, if any. Format: seconds from epoch
// nonce: An ID unique to this application to match the response in the callback.
//
// @returns
// uuid: The unique ID of the DLC in the DLCManager object. Store this value and use
// it to interact with the DLCManager contract
bytes32 dlcUUID = _dlcManager.createDLC(emergencyRefundTime, nonce);
```

## Overrides
The following functions can be overridden from the DLCLinkCompatible contract for various DLC functionality.

```js
// Overwrite this function to complete your DLC setup logic. Called after the DLC is successfully created on the Bitcoin (DLC) Oracles off-chain
function postCreateDLCHandler(bytes32 uuid) external;

// Overwrite this function to run custom logic when the contract (DLC) on Bitcoin has been funded
function setStatusFunded(bytes32 uuid) external;

// If desired, mint an NFT representing the Bitcoin contract which can be transfered and borrowed against.
_dlcManager.mintBtcNft(dlcUUID);

// Overwrite this function to complete the mintNFT logic
function postMintBtcNft(bytes32 uuid, uint256 nftId) external;

// Overwrite this function to receive the price of BTC when closing the DLC
function getBtcPriceCallback(bytes32 uuid, int256 price, uint256 timestamp) external;
```

## Closing the DLC
Finally, the contract can call close on the DLCManager with the UUID of the contract to create the DLC attestation and close the Bitcoin contract. At this point, the funds will get sent out of the Bitcoin contract and sent back to the participants' BTC wallets in the ratio set in the close function.

```js
// Close the DLC, which sends the collateral out of the Bitcoin DLC at the given ratio.
//
// @parameters
// payoutRatio: Number between 0 and 100 representing the % of bitcoin paid out from the DLC to the original participants
//              0 means the user gets all the collateral, 100 means this contract gets all the collateral.
 _dlcManager.closeDLC(dlcUUID, payoutRatio);

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
# To deploy all contracts and set the correct roles:
dlc-link-eth deploy-all
```

Note that properly testing the entire DLC creation flow requires an instance of a DLC.Link Observer running -- but contract-integration can still be tested thoroughly and easily:
## Testing

### With Hardhat
-----------------
`npx hardhat test`

*optionally, `--parallel` to speed this up a bit.

Modify the hardhat.config.js for more testing / deployment options.

# What Are DLCs
[Discreet Log Contracts](https://dci.mit.edu/smart-contracts) (DLCs) facilitate conditional payments on Bitcoin between two or more parties. By creating a Discreet Log Contract, two parties can form a monetary contract redistributing their funds to each other without revealing any details to the blockchain. Its appearance on the Bitcoin blockchain will be no different than an ordinary multi-signature output, so no external observer can learn its existence or details from the public ledger. A DLC is similar to a 2-of-3 multisig transaction where the third participant is an “oracle”.  An oracle is a 3rd party source of data or information that the parties to the DLC trust as the source of truth for the contract. The oracle is incentivized to be a fair arbiter of the contract.

# About DLC Link
DLC.Link is building infrastructure to empower decentralized applications and smart contract developers to easily leverage the power of DLCs. We provide companies and applications with a traditional REST API and a smart contract interface to create and manage DLCs for their use cases.

DLCs require an oracle to attest to a specific outcome among the predefined set of outcomes. That means trust.

Why power DLC oracles with smart contracts? By using a smart contract for this task, the implementation of the logic, as well as the data being used, is stamped on the chain, and is *visible and reviewable* by everyone.

Unlike other DLC Oracle server solutions, DLC.link allows the DLCs to be configured with a simple interface, API or via smart contract, and to act on a wide-set of events and data sources through our decentralized infrastructure.

There are two types of events / data sources supported by DLC.link.

1. Off-chain pricing data, such as the current price of BTC, ETH, etc. In fact, any numeric data from Chainlink Oracle Network is supported.

2. On-chain events, such as a completed transaction, a function call, etc.
