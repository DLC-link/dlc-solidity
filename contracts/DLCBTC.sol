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
 * @custom:contact eng@dlc.link
 * @custom:website https://www.dlc.link
 */
contract DLCBTC is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    OwnableUpgradeable
{
    mapping(address => bool) public blacklisted; // deprecated. there is no blacklisting anymore
    address private _minter;
    address private _burner;
    uint256[48] __gap;

    error NotAuthorized();

    event MinterSet(address minter);
    event BurnerSet(address burner);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __ERC20_init("dlcBTC", "dlcBTC");
        __Ownable_init();
        __ERC20Permit_init("dlcBTC");
    }

    modifier onlyOwnerOrCCIPMinter() {
        if (msg.sender != _minter && msg.sender != owner())
            revert NotAuthorized();
        _;
    }

    modifier onlyCCIPBurner() {
        if (msg.sender != _burner) revert NotAuthorized();
        _;
    }

    // Representing Satoshis
    function decimals() public view virtual override returns (uint8) {
        return 8;
    }

    function symbol() public view virtual override returns (string memory) {
        return "dlcBTC";
    }

    function mint(address to, uint256 amount) external onlyOwnerOrCCIPMinter {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    function burn(uint256 amount) external onlyCCIPBurner {
        _burn(msg.sender, amount);
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
