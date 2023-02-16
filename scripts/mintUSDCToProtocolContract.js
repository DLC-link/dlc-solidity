const { ethers } = require("ethers");
const web3 = require('web3')
require('dotenv').config();

async function main() {
    // Configuring the connection to an Ethereum node
    const network = 'goerli';
    const provider = new ethers.providers.InfuraProvider(
        network,
        process.env['INFURA_PROJECT_ID']
    );
    // Creating a signing account from a private key
    const signer = new ethers.Wallet(process.env['KEY'], provider);

    const abi = [
        "constructor()",
        "event Approval(address indexed owner, address indexed spender, uint256 value)",
        "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
        "event Transfer(address indexed from, address indexed to, uint256 value)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function burn(uint256 amount)",
        "function burnFrom(address account, uint256 amount)",
        "function decimals() view returns (uint8)",
        "function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)",
        "function flashFee(address token, uint256 amount) view returns (uint256)",
        "function flashLoan(address receiver, address token, uint256 amount, bytes data) returns (bool)",
        "function increaseAllowance(address spender, uint256 addedValue) returns (bool)",
        "function maxFlashLoan(address token) view returns (uint256)",
        "function mint(address to, uint256 amount)",
        "function name() view returns (string)",
        "function owner() view returns (address)",
        "function renounceOwnership()",
        "function symbol() view returns (string)",
        "function totalSupply() view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function transferFrom(address from, address to, uint256 amount) returns (bool)",
        "function transferOwnership(address newOwner)"
    ]

    let tx;
    const usdc = new ethers.Contract("0x010b1182f68d5aF23C4e81E77EcA5352F3520Ed5", abi, signer)
    tx = await usdc.mint('0x0285E68DD9A0D000A5c4CbD279BFF9F790a0920f', 100000000);
    console.log(tx);
}

main();
