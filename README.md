# Dev notes:
Currently `npm i` only works with the --legacy-peer-deps flag, because of a dependency bug in: https://github.com/tryethernal/hardhat-ethernal/issues/22

To run a local hardhat node and IPFS instance:
```bash
$ ./start-local-environment.sh
# To run a deployment script in another terminal:
$ npx hardhat run --network localhost scripts/deploy-all-ethernal.js
```

This will use the `ethernal` plugin and on `https://app.tryethernal.com/blocks` after login/connection you can browse the chain in a visual explorer.

# DLC Manager Smart Contract

This smart contract is the interface for creating and closing DLCs via the DLC.Link infrastructure. For cases where the DLC requires market prices of assets (e.g. BTC price) this contract is responsible for fetching that (via Chainlink) as part of it's closing criteria.

Learn more about [DLCs](https://github.com/DLC-link/dlc-solidity-smart-contract#What-Are-DLCs) and [DLC.Link](https://github.com/DLC-link/dlc-solidity-smart-contract#About-DLC-Link) below.

# Overview
A DLC requires an oracle to attest to a specific outcome among the predefined set of outcomes. That means trust.

This contract acts to feed the outcome of the DLC. By using a smart contract for this task, the implementation of the logic, as well as the data being used, is stamped on the chain, and is visible and reviewable by everyone.

# How to interact with this contract

## Opening a DLC
When you register a DLC with this contract using the `requestCreateDLC` function, a DLC is opened on our DLC server with the associated outcomes (CETs). The DLC *announcement hash*, which needed to fund the DLC, is available on the website, and eventually via an API call and on-chain.

*(TBD How does the UUID or handle come back to the caller?)*

The creation of a DLC can also be triggered with a traditional JSON API call (*coming soon TBD*)

With the announcement hash, you are now able to set up the DLC between the two participants (users, user/protocol, etc.)

## Closing the DLC
The DLC gets closed one of two ways.
1. When the `closingTime` has passed the performUpkeep function will get called by the Chainlink keeper. This will get the price from the associated Chainlink data feed, save this price and time in the contract, and stamp that data on the ledger.

2. If the `cancelEarly` function is called by the DLC creator identity, then the dlc will be closed without waiting for the Chainlink Keeper. The price will be fetched from the associated Chainlink data feed, the price and time will be saved in the contract, and that data will be stamped on the ledger.

Either way, our system listens to this, and closes the DLC in the DLC oracle with the associated data. An *attestation hash* is now created and like the announcement hash, can be acquired via the website or API (or eventually smart contract).

The attestation hash is what will be used by the participants (user, protocol, etc.) to unlock the funds in the DLC.

# Contributing
We are happy to have support and contribution from the community. Please find us on Discord and see below for developer details.
## Setup
For reference, a sample of this deployed contract can be found here: [Discreet Log Manager](https://kovan.etherscan.io/address/0x365441EC0974F6AC9871c704128e9da2BEdE10CE#code)

Add a `secrets.json` file with the following fields:

```json
{
    "etherscanApiKey" : "",
    "key" : "",
    "nodeUrl" : ""
}
```
`etherscanApiKey`: register to etherscan.io and get an api key. This will be used for contract verification.

`key`: your account private key you want to deploy from. Used by truffle.

`nodeUrl`: your RPC node url. For example, infura.io.

## Testing
-----------------
Start a Ganache server

https://trufflesuite.com/docs/ganache/quickstart/

Run
```console
truffle compile
truffle migrate
truffle test
```

## Deploy to Kovan
-----------------
```console
truffle compile
truffle migrate --network kovan
```

## Verify contract
-----------------
**_NOTE:_**  this step is required for UpKeep registration
```console
truffle run verify DLCManager --network kovan
```
After Verification Register Keeper Upkeep for the Contract
## Keeper Configuraton
-----------------

In essence ChainLink Keepers are a decentralised way to automate smart contract function calls.  For this contract, this is useful as a way to check the contracts to see if the closingTime has passed, and close the contract accordingly.

Steps in a nutshell:
1. Make your contract Keepers-compatible. For this contract, this is done by adding the `checkUpkeep` and `performUpkeep` functions.
2. Register a new Upkeep
3. After your Upkeep is registered and funded, manage it in the Keepers App


### For more information, read these in this order:
[Keepers intro](https://docs.chain.link/docs/chainlink-keepers/overview/)

[Keepres configuration](https://docs.chain.link/docs/chainlink-keepers/compatible-contracts/)

[Register UpKeep](https://docs.chain.link/docs/chainlink-keepers/register-upkeep/)

[Manage UpKeep](https://docs.chain.link/docs/chainlink-keepers/manage-upkeeps/)

Watch [this](https://www.youtube.com/watch?v=-Wkw5JVQGUo&t=1s&ab_channel=Chainlink) if you prefer video format, but i would still recommend to go trough the official docs.

**IMPORTANT: always keep enough LINK on your UpKeep account or the Keeper won't work (the minimum amount of LINK is displayed on the UpKeep page)**

![Screenshot 2022-04-12 at 14 01 58](https://user-images.githubusercontent.com/38463744/162958829-bccd708d-53ec-4493-8be3-a04772461219.png)

## Usage
Provide the admin address during deployment (can be the deployer address)
```solidity
constructor(address _adminAddress)
```
Add new DLC (**admin only*)
```solidity
addNewDLC(string memory _UUID, address _feedAddress, uint _closingTime)
```
`_UUID`: string format (based on [this](https://dlc-link.herokuapp.com/contracts))

`_feedAddress`: the address of the price feed eg.: [BTC/USD](https://kovan.etherscan.io/address/0x6135b13325bfC4B00278B4abC5e20bbce2D6580e#readContract) on kovan

`_closingTime`: UNIX timestamp in **GMT+0** (must be in [seconds](https://ethereum.stackexchange.com/questions/7853/is-the-block-timestamp-value-in-solidity-seconds-or-milliseconds#:~:text=The%20blocks.,when%20the%20block%20was%20created.&text=I%20thank%20you%20for%20your%20response.))

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

## DLC closing

If the `block.timestamp` passes the `dlc.closingTime`

The close of the DLCs happens automatically with the help of [ChainLink Keepers](https://docs.chain.link/docs/chainlink-keepers/introduction/)

## Closed DLC

The `dlc.closingPrice` is not a scaled price, it must be converted by the client based on the quote decimals.

For `dlc.actualClosingTime` the `updatedAt` timestamp is used from the pricefeed (See **Known Issue** section for more info).

## Example Closed DLC

```console
UUID                string  :  uuid13
feedAddress         address :  0x6135b13325bfC4B00278B4abC5e20bbce2D6580e
closingTime         uint256 :  1649764260
closingPrice        int256  :  4018901000000
actualClosingTime   uint256 :  1649750416
```

# Gas Estimations
**_NOTE: gas price needs to be adjusted based on the chain_**
```
gas_used * gas_price = gas_cost
```
Tool to convert ETH units: https://eth-converter.com/
## On testnet:
Contract deployment
```console
gas used:            2514657 wei
gas price:           20 gwei
total cost:          0.05029314 ETH
```

Add newDLC
```console
gas used:            135451 wei
gas price:           20 gwei
total cost:          0.00270902 ETH
```
Keeper performUpKeep

The average LINK cost is around 0.11 - 0.13 / performUpKeep

https://keepers.chain.link/kovan/2944
![Screenshot 2022-04-14 at 12 41 24](https://user-images.githubusercontent.com/38463744/163374627-9bb25752-273f-4ab9-8dff-aca8e9ca4622.png)

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
