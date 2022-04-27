# DiscreetLog Smart Contract

## **Deployed contract can be found here: [DiscreetLog](https://kovan.etherscan.io/address/0x365441EC0974F6AC9871c704128e9da2BEdE10CE#code)**

# Setup

Add `secrets.json` file with the following fields:

```json
{
    "etherscanApiKey" : "",
    "key" : "",
    "nodeUrl" : ""
}
```
`etherscanApiKey`: register to etherscan.io and get an api key

`key`: your account private key you want to deploy from

`nodeUrl`: your RPC node url

# Tests
Start a Ganache server

https://trufflesuite.com/docs/ganache/quickstart/

Run
```console
truffle compile
truffle migrate
truffle test
```

# Deploy to Kovan
```console
truffle compile
truffle migrate --network kovan
```

# Verify contract
**_NOTE:_**  this step is required for UpKeep registration
```console
truffle run verify DiscreetLog --network kovan
```
After Verification Register Keeper Upkeep for the Contract
# Keeper Configuraton

In essence ChainLink Keepers are a decentralised way to automate smart contracts.

Steps in a nutshell:
1. Make your contract Keepers-compatible
2. Register a new Upkeep
3. After your Upkeep is registered and funded, manage it in the Keepers App


### Read these in this order:
[Keepers intro](https://docs.chain.link/docs/chainlink-keepers/overview/)

[Keepres configuration](https://docs.chain.link/docs/chainlink-keepers/compatible-contracts/)

[Register UpKeep](https://docs.chain.link/docs/chainlink-keepers/register-upkeep/)

[Manage UpKeep](https://docs.chain.link/docs/chainlink-keepers/manage-upkeeps/)

Watch [this](https://www.youtube.com/watch?v=-Wkw5JVQGUo&t=1s&ab_channel=Chainlink) if you prefer video format, but i would still recommend to go trough the official docs.

**IMPORTANT: always keep enough LINK on your UpKeep account or the Keeper won't work (the minimum amount of LINK is displayed on the UpKeep page)**

![Screenshot 2022-04-12 at 14 01 58](https://user-images.githubusercontent.com/38463744/162958829-bccd708d-53ec-4493-8be3-a04772461219.png)

# Usage
Provide the admin address during deployment (can be the deployer address)
```solidity
constructor(address _adminAddress)
```
Add new DLC (only admin can call it)
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
const contract = new ethers.Contract(contractAddress, DiscreetLog.abi, signer);

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

https://keepers.chain.link/kovan/2879
![Screenshot 2022-04-14 at 12 41 24](https://user-images.githubusercontent.com/38463744/163374627-9bb25752-273f-4ab9-8dff-aca8e9ca4622.png)

# Known Issue
The chainlink price feed is updated based on parameters. For example BTC/USD feed on ETH mainnet updates only every hour or if the price changes by 0.5%. Since the DLC closing uses the timestamp from the price feed (because that is the actual time the price was updated, which means that is the "real" actualClosingTime) it can happen that the `actualClosingTime` will be in the past relative to the closingTime supplied at DLC creation. We could use the `block.timestamp` as actualClosingTime as a solution, but that would raise the question if that is correct in this case or not. An another solution would be to log both the pricefeed timestamp and the block.timestamp as well.
