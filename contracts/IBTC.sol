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
 * @title   iBTC
 * @notice  The iBTC Token represents Bitcoin locked in self-custody by the DLC.Link protocol.
 * @dev     Owner is the DLCManager contract, which can mint/burn tokens
 * @dev     Minter/Burner rights are also given to CCIP token pools
 * @custom:contact eng@dlc.link
 * @custom:website https://www.dlc.link
 */
contract IBTC is
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
        __ERC20_init("iBTC", "IBTC");
        __Ownable_init();
        __ERC20Permit_init("iBTC");
    }

    /**
     * @notice Reinitializes the EIP712 domain separator
     * @dev This function is used to reinitialize the EIP712 domain separator after a change in the name
     * @dev Name changed from "dlcBTC" to "iBTC"
     */
    function reinitializeEIP712() public reinitializer(2) {
        __EIP712_init_unchained("iBTC", "1");
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

    function name() public view virtual override returns (string memory) {
        return "iBTC";
    }

    function symbol() public view virtual override returns (string memory) {
        return "IBTC";
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
