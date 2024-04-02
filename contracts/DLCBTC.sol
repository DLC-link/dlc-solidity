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

    error BlacklistedSender();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __ERC20_init("dlcBTC", "DLCBTC");
        __Ownable_init();
        __ERC20Permit_init("dlcBTC");
    }

    // Representing Satoshis
    function decimals() public view virtual override returns (uint8) {
        return 8;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    function blacklist(address account) external onlyOwner {
        blacklisted[account] = true;
    }

    function unblacklist(address account) external onlyOwner {
        blacklisted[account] = false;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);
        // Following best practices for blacklisting
        require(!blacklisted[from], "DLCBTC: sender blacklisted");
        require(!blacklisted[to], "DLCBTC: recipient blacklisted");
    }
}
