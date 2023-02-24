const { ethers } = require('ethers');
const web3 = require('web3');
require('dotenv').config();

// The 'mime' npm package helps us set the correct file type on our File objects
const mime = require('mime-types');

// The 'fs' builtin module on Node.js provides access to the file system
const fs = require('fs');

// The 'path' module provides helpers for manipulating filesystem paths
const path = require('path');

async function main() {
  // Configuring the connection to an Ethereum node
  const network = 'sepolia';
  const provider = new ethers.providers.InfuraProvider(network, process.env['INFURA_PROJECT_ID']);
  // Creating a signing account from a private key
  const signer = new ethers.Wallet(process.env['KEY'], provider);

  const abi = [
    'constructor()',
    'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
    'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
    'event NFTMinted(uint256 indexed _id)',
    'event Paused(address account)',
    'event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)',
    'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
    'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
    'event Unpaused(address account)',
    'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
    'function MINTER_ROLE() view returns (bytes32)',
    'function PAUSER_ROLE() view returns (bytes32)',
    'function approve(address to, uint256 tokenId)',
    'function balanceOf(address owner) view returns (uint256)',
    'function burn(uint256 tokenId)',
    'function getApproved(uint256 tokenId) view returns (address)',
    'function getDLCNFTsByOwner(address owner) view returns (tuple(uint256 id, string uri, address originalDepositor, address broker)[])',
    'function getRoleAdmin(bytes32 role) view returns (bytes32)',
    'function grantRole(bytes32 role, address account)',
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function isApprovedForAll(address owner, address operator) view returns (bool)',
    'function name() view returns (string)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function pause()',
    'function paused() view returns (bool)',
    'function renounceRole(bytes32 role, address account)',
    'function revokeRole(bytes32 role, address account)',
    'function safeMint(address to, string uri, address broker)',
    'function safeTransferFrom(address from, address to, uint256 tokenId)',
    'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
    'function setApprovalForAll(address operator, bool approved)',
    'function supportsInterface(bytes4 interfaceId) view returns (bool)',
    'function symbol() view returns (string)',
    'function tokenByIndex(uint256 index) view returns (uint256)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
    'function tokenURI(uint256 tokenId) view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function transferFrom(address from, address to, uint256 tokenId)',
    'function unpause()',
  ];

  let tx;
  // Creating and sending the transaction object
  const btcNft = new ethers.Contract('0xC210ffC0875f0Cb45DA14CF23DDeA2aB509Abc96', abi, signer);
  const RoleInBytes = web3.utils.soliditySha3('PAUSER_ROLE');
  tx = await btcNft.grantRole(RoleInBytes, process.env.OBSERVER_ADDRESS);
  console.log(tx);

  const RoleInBytes2 = web3.utils.soliditySha3('MINTER_ROLE');
  tx = await btcNft.grantRole(RoleInBytes2, process.env.OBSERVER_ADDRESS);
  console.log(tx);
}

/**
 * A helper to read a file from a location on disk and return a File object.
 * Note that this reads the entire file into memory and should not be used for
 * very large files.
 * @param {string} filePath the path to a file to store
 * @returns {File} a File object containing the file content
 */
async function fileFromPath(filePath, nameToUse) {
  const content = await fs.promises.readFile(filePath);
  const type = mime.lookup(filePath);
  return new File([content], path.basename(nameToUse), { type });
}

main();
