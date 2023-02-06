// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

import "@openzeppelin/contracts/utils/Counters.sol";

/// @custom:security-contact jesse@dlc.link
contract BtcNft is
    ERC721,
    ERC721URIStorage,
    ERC721Enumerable,
    Pausable,
    AccessControl,
    ERC721Burnable
{
    using Counters for Counters.Counter;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    Counters.Counter private _tokenIdCounter;
    mapping(uint256 => address) private _originalDepositors;
    mapping(uint256 => address) private _brokers;

    event NFTMinted(uint256 indexed _id);

    struct DLCNFT {
        uint256 id;
        string uri;
        address originalDepositor;
        address broker;
    }

    constructor() ERC721("BtcNft", "DLC") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://";
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // This is not a standard mint function, but that's OK because it should only be called by the DLC minter app
    function safeMint(
        address to,
        string memory uri,
        address broker
    ) public onlyRole(MINTER_ROLE) {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        _setOriginalDepositor(tokenId, to);
        _setBroker(tokenId, broker);
        emit NFTMinted(tokenId);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    // The following functions are overrides required by Solidity.

    function _burn(uint256 tokenId)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(tokenId);
    }

    /**
     * @dev Sets `_originalDepositor` as the originalDepositor of `tokenId`.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function _setOriginalDepositor(uint256 tokenId, address _originalDepositor)
        internal
        virtual
    {
        require(
            _exists(tokenId),
            "ERC721URIStorage: URI set of nonexistent token"
        );
        _originalDepositors[tokenId] = _originalDepositor;
    }

    /**
     * @dev Sets `_broker` as the broker of `tokenId`.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function _setBroker(uint256 tokenId, address _broker) internal virtual {
        require(
            _exists(tokenId),
            "ERC721URIStorage: URI set of nonexistent token"
        );
        _brokers[tokenId] = _broker;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function getDLCNFTsByOwner(address owner)
        public
        view
        returns (DLCNFT[] memory)
    {
        uint256 balance = balanceOf(owner);
        DLCNFT[] memory tokenURIsForOwner = new DLCNFT[](balance);
        for (uint256 i = 0; i < balance; i++) {
            uint256 id = tokenOfOwnerByIndex(owner, i);
            DLCNFT memory x = DLCNFT({
                id: id,
                uri: tokenURI(id),
                originalDepositor: _originalDepositors[id],
                broker: _brokers[id]
            });
            tokenURIsForOwner[i] = x;
        }
        return tokenURIsForOwner;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
}
