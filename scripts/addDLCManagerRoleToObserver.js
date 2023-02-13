const { ethers } = require("ethers");
const secrets = require('../secrets.json');
const web3 = require('web3')

async function main() {
    // Configuring the connection to an Ethereum node
    const network = 'goerli';
    const provider = new ethers.providers.InfuraProvider(
        network,
        'f98176005c9043ad94c883c2c977bf23'
    );
    // Creating a signing account from a private key
    const signer = new ethers.Wallet(secrets.key, provider);

    const abi = [
        "constructor(address _adminAddress, address _btcPriceFeedAddress)",
        "event BTCPriceFetching(bytes32 uuid, address caller, int256 price, string eventSource)",
        "event CloseDLC(bytes32 uuid, uint256 outcome, address creator, string eventSource)",
        "event CreateDLC(bytes32 uuid, address creator, address receiver, uint256 emergencyRefundTime, uint256 nonce, string eventSource)",
        "event MintBtcNft(bytes32 dlcUUID, address creator, address receiver, uint256 btcDeposit, string eventSource)",
        "event PostCloseDLC(bytes32 uuid, uint256 outcome, uint256 actualClosingTime, string eventSource)",
        "event PostCreateDLC(bytes32 uuid, address creator, address receiver, uint256 emergencyRefundTime, uint256 nonce, string eventSource)",
        "event PostMintBtcNft(bytes32 uuid, uint256 nftId, string eventSource)",
        "event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)",
        "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
        "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
        "event SetStatusFunded(bytes32 uuid, string eventSource)",
        "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
        "function DLC_ADMIN_ROLE() view returns (bytes32)",
        "function btcPriceFeedAddress() view returns (address)",
        "function closeDLC(bytes32 _uuid, uint256 _outcome)",
        "function createDLC(uint256 _emergencyRefundTime, uint256 _nonce) returns (bytes32)",
        "function dlcs(bytes32) view returns (bytes32 uuid, uint256 emergencyRefundTime, address creator, address receiver, uint256 outcome, uint256 nonce)",
        "function getAllUUIDs() view returns (bytes32[])",
        "function getBTCPriceWithCallback(bytes32 _uuid) returns (int256)",
        "function getDLC(bytes32 _uuid) view returns (tuple(bytes32 uuid, uint256 emergencyRefundTime, address creator, address receiver, uint256 outcome, uint256 nonce))",
        "function getRoleAdmin(bytes32 role) view returns (bytes32)",
        "function grantRole(bytes32 role, address account)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function mintBtcNft(bytes32 _uuid, uint256 _collateral)",
        "function openUUIDs(uint256) view returns (bytes32)",
        "function postCloseDLC(bytes32 _uuid, uint256 _oracleOutcome)",
        "function postCreateDLC(bytes32 _uuid, uint256 _emergencyRefundTime, uint256 _nonce, address _creator, address _receiver)",
        "function postMintBtcNft(bytes32 _uuid, uint256 _nftId)",
        "function renounceRole(bytes32 role, address account)",
        "function revokeRole(bytes32 role, address account)",
        "function setStatusFunded(bytes32 _uuid)",
        "function supportsInterface(bytes4 interfaceId) view returns (bool)"
    ]

    let tx;
    const dlcManager = new ethers.Contract("0xa726f69681E7592825ce5cc0aBE1e6f6b4055397", abi, signer)
    const RoleInBytes = web3.utils.soliditySha3("DLC_ADMIN_ROLE");
    tx = await dlcManager.grantRole(RoleInBytes, '0xbf7184178d610d7b0239a5cb8d64c1df22d306a9')
    console.log(tx);
}

main();
