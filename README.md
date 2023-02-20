# DLC Manager Smart Contract

This smart contract is the interface for creating and closing DLCs via the DLC.Link infrastructure. For cases where the DLC requires market prices of assets (e.g. BTC price) this contract is responsible for fetching that (via Chainlink) as part of it's closing criteria.

Learn more about [DLCs](https://github.com/DLC-link/dlc-solidity-smart-contract#What-Are-DLCs) and [dlc.link](https://dlc.link).

## Overview
A DLC requires an oracle to attest to a specific outcome among the predefined set of outcomes. The DLC can then be used to lock bitcoin in a contract on the bitcoin network, and action regarding that bitcoin can be taken on the EVM blockchain. After the DLC is closed, that Bitcoin is moved out of the bitcoin contract and back to the participants in a proportion given in the dlc_close function.

Learn more about the whole architecture on the documentation site here:
https://docs.dlc.link/architecture/tech-stack

# Getting Started

## Example
We have developed a few example applications which uses DLCs.

You can find these examples under the contracts/examples folder.

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
For reference, a sample of this deployed contract can be found here: [Discreet Log Manager](https://kovan.etherscan.io/address/0x365441EC0974F6AC9871c704128e9da2BEdE10CE#code)

Add a `.env` file with the following fields:

```bash
NODE_URL="https://goerli.infura.io/v3/<PROJECT_ID>" # needed for deploying
INFURA_PROJECT_ID="<PROJECT_ID>" # needed for deploying
KEY="<ETH_PRIVATE_KEY>" # needed for deploying
ETHERSCAN_API_KEY="<ETHERSCAN_API_KEY>" # only needed for submitting the contract to etherscan
```

# Dev notes:
Currently `npm i` only works with the --legacy-peer-deps flag, because of a dependency bug in: https://github.com/tryethernal/hardhat-ethernal/issues/22

To run a local hardhat node and IPFS instance:
```bash
$ ./start-local-environment.sh
# To run a deployment script in another terminal:
$ npx hardhat run --network localhost scripts/deploy-all-ethernal.js
```

This will use the `ethernal` plugin and on `https://app.tryethernal.com/blocks` after login/connection you can browse the chain in a visual explorer.

## Testing

### With Ganache/Truffle
-----------------
#### Start a Ganache server

https://trufflesuite.com/docs/ganache/quickstart/

#### Run
```console
truffle compile
truffle migrate
truffle test
```
#### Deploy to Kovan
-----------------
```console
truffle compile
truffle migrate --network kovan
```
### With Hardhat
-----------------
coming soon

### Example with ether.js
```javascript
// Connect web3
// Get signer method 1 (good for front-end)
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();

// Get signer method 2 (for back-end)
const provider = new ethers.providers.JsonRpcProvider("yourRpcNodeUrl");
const signer = new ethers.Wallet("private-key", provider);


const contractAddress = "0x1b82CBECfC306F9D5Db19BeD0c7b725DE8E4b7a7";
const contract = new ethers.Contract(contractAddress, DLCManager.abi, signer);

// contract call
await contract.addNewDLC("fakeUUID", "feedAddress", 1649739612);

// listen to events
contract.on("CloseDLC", (UUID, price, timeStamp) => {
    console.log(`DLC closed with UUID: ${UUID} at price: ${price} at ${timeStamp}`);
});
```

# Known Issues
The chainlink price feed is updated based on various parameters. For example, the BTC/USD feed on ETH mainnet updates only every hour or if the price changes by 0.5%. Since the DLC closing uses the timestamp from the price feed (because that is the actual time the price was updated, which means that is the "real" actualClosingTime) it can happen that the `actualClosingTime` will be in the past relative to the closingTime supplied at DLC creation. We could use the `block.timestamp` as actualClosingTime as a solution, but that would raise the question if that is correct in this case or not. Another solution would be to log both the pricefeed timestamp and the block.timestamp as well.

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
