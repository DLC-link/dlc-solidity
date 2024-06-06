// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @author  DLC.Link 2024
 * @title   DLCBTC
 * @notice  The DLCBTC Token represents Bitcoin locked through the DLC.Link bridge
 * @dev     Owner is the TokenManager contract
 * @custom:contact robert@dlc.link
 * @custom:website https://www.dlc.link
 */
contract DLCBTC is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    OwnableUpgradeable
{
    mapping(address => bool) public blacklisted;
    address private _minter;
    address private _burner;
    uint256[48] __gap;

    error BlacklistedSender();
    error BlacklistedRecipient();
    error NotAuthorized();

    event Blacklisted(address account);
    event Unblacklisted(address account);
    event MinterSet(address minter);
    event BurnerSet(address burner);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __ERC20_init("dlcBTC", "DLCBTC");
        __Ownable_init();
        __ERC20Permit_init("dlcBTC");
    }

    modifier onlyMinterOrOwner() {
        if (msg.sender != _minter && this.owner() != msg.sender)
            revert NotAuthorized();
        _;
    }

    modifier onlyBurnerOrOwner() {
        if (msg.sender != _burner && this.owner() != msg.sender)
            revert NotAuthorized();
        _;
    }

    // Representing Satoshis
    function decimals() public view virtual override returns (uint8) {
        return 8;
    }

    function mint(address to, uint256 amount) external onlyMinterOrOwner {
        _mint(to, amount);
    }

    function mint(uint256 amount) external onlyMinterOrOwner {
        _mint(msg.sender, amount);
    }

    function burn(address from, uint256 amount) external onlyBurnerOrOwner {
        _burn(from, amount);
    }

    function burn(uint256 amount) external onlyBurnerOrOwner {
        _burn(msg.sender, amount);
    }

    function blacklist(address account) external onlyOwner {
        blacklisted[account] = true;
        emit Blacklisted(account);
    }

    function unblacklist(address account) external onlyOwner {
        blacklisted[account] = false;
        emit Unblacklisted(account);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);
        if (blacklisted[from]) revert BlacklistedSender();
        if (blacklisted[to]) revert BlacklistedRecipient();
    }

    function setMinter(address minter) external onlyOwner {
        _minter = minter;
        emit MinterSet(minter);
    }

    function setBurner(address burner) external onlyOwner {
        _burner = burner;
        emit BurnerSet(burner);
    }
}
