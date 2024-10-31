// SPDX-License-Identifier: MIT
//     ___  __   ___    __ _       _
//    /   \/ /  / __\  / /(_)_ __ | | __
//   / /\ / /  / /    / / | | '_ \| |/ /
//  / /_// /__/ /____/ /__| | | | |   <
// /___,'\____|____(_)____/_|_| |_|_|\_\

pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/access/AccessControlDefaultAdminRulesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "./DLCLinkLibrary.sol";
import "./interfaces/IIntegration.sol";

interface IDLCManager {
    function setupPendingVault(
        string calldata _taprootPubKey,
        string calldata _wdTxId
    ) external returns (bytes32);

    function withdraw(bytes32 uuid, uint256 amount) external;
    function getDLC(bytes32 uuid) external view returns (DLCLink.DLC memory);
}

contract PoolMerchant is
    Initializable,
    ERC165Upgradeable,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    IERC721Receiver,
    IERC1155Receiver
{
    using DLCLink for DLCLink.DLC;
    using DLCLink for DLCLink.DLCStatus;

    ////////////////////////////////////////////////////////////////
    //                      STATE VARIABLES                       //
    ////////////////////////////////////////////////////////////////

    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant HARVESTER_ROLE = keccak256("HARVESTER_ROLE");

    IDLCManager public dlcManager;
    IERC20 public dlcBTC;

    struct RewardToken {
        address tokenAddress;
        bool isActive;
    }

    struct UserReward {
        uint256 lastClaimedAt;
        uint256 pendingAmount;
    }

    struct VaultInfo {
        address integration;
        uint256 shares;
        uint256 allocated;
        mapping(address => UserReward) rewards; // token -> reward
        uint256 integrationIndex; // Index in the integration's vault array + 1 (0 means not in array)
    }

    struct Integration {
        IIntegration strategy;
        bool isActive;
        uint256 totalShares;
        address[] supportedRewardTokens;
        bytes32[] vaults; // Array of vault UUIDs using this integration
    }

    mapping(bytes32 => VaultInfo) internal _vaults;
    mapping(address => Integration) public integrations;
    mapping(address => RewardToken) public rewardTokens;
    address[] public activeIntegrations;

    uint256 public totalValueLocked;
    uint256[50] private __gap;

    ////////////////////////////////////////////////////////////////
    //                          EVENTS                            //
    ////////////////////////////////////////////////////////////////

    event PendingVaultCreated(
        bytes32 indexed uuid,
        string taprootPubKey,
        string withdrawalTxId,
        address integration
    );
    event VaultWithdrawn(bytes32 indexed uuid, uint256 amount);
    event IntegrationAdded(
        address indexed integration,
        address[] supportedRewards
    );
    event RewardTokenAdded(address indexed token);
    event SharesAllocated(
        bytes32 indexed uuid,
        address indexed integration,
        uint256 shares
    );
    event RewardsHarvested(
        address indexed integration,
        address indexed rewardToken,
        address indexed harvester,
        uint256 amount
    );
    event RewardsClaimed(
        bytes32 indexed uuid,
        address indexed rewardToken,
        uint256 amount
    );

    ////////////////////////////////////////////////////////////////
    //                        CONSTRUCTOR                         //
    ////////////////////////////////////////////////////////////////

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _dlcManager,
        address _dlcBTC,
        address defaultAdmin
    ) public initializer {
        __AccessControlDefaultAdminRules_init(2 days, defaultAdmin);
        __Pausable_init();
        __ReentrancyGuard_init();
        __ERC165_init();

        dlcManager = IDLCManager(_dlcManager);
        dlcBTC = IERC20(_dlcBTC);
    }

    ////////////////////////////////////////////////////////////////
    //                       MAIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    function createPendingVault(
        string calldata taprootPubKey,
        string calldata withdrawalTxId,
        address integration
    )
        external
        onlyRole(ATTESTOR_ROLE)
        nonReentrant
        whenNotPaused
        returns (bytes32)
    {
        require(integrations[integration].isActive, "Integration not active");

        bytes32 _uuid = dlcManager.setupPendingVault(
            taprootPubKey,
            withdrawalTxId
        );

        _vaults[_uuid].integration = integration;
        _addVaultToIntegration(_uuid, integration);

        emit PendingVaultCreated(
            _uuid,
            taprootPubKey,
            withdrawalTxId,
            integration
        );
        return _uuid;
    }

    function withdrawFromVault(
        bytes32 uuid,
        uint256 amount
    ) external onlyRole(ATTESTOR_ROLE) nonReentrant whenNotPaused {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        require(dlc.uuid != bytes32(0), "Vault does not exist");

        VaultInfo storage vault = _vaults[uuid];
        address integration = vault.integration;
        require(integration != address(0), "No integration set");
        require(amount <= vault.allocated, "Amount exceeds allocation");

        Integration storage integ = integrations[integration];

        // Harvest any pending rewards
        if (vault.shares > 0) {
            _harvestRewardsForVault(uuid);
        }

        // Calculate shares to withdraw based on requested amount
        uint256 sharesToWithdraw;
        if (amount == vault.allocated) {
            // If withdrawing all, withdraw all shares
            sharesToWithdraw = vault.shares;
        } else {
            // Otherwise, withdraw proportional shares
            sharesToWithdraw = (vault.shares * amount) / vault.allocated;
        }

        // Withdraw from integration
        uint256 received = integ.strategy.withdraw(sharesToWithdraw);

        // Update state based on what we actually received
        vault.shares -= sharesToWithdraw;
        integrations[integration].totalShares -= sharesToWithdraw;

        // If we received less than requested, we need to adjust the withdrawal amount
        uint256 withdrawAmount;
        if (received < amount) {
            // We can only withdraw what we actually received
            withdrawAmount = received;
            // Adjust allocation down based on what we actually received
            vault.allocated -= received;
        } else {
            // We got enough or more than requested
            withdrawAmount = amount;
            vault.allocated -= amount;
            if (received > amount) {
                // If we got extra, add it to allocation
                vault.allocated += (received - amount);
            }
        }

        // Clean up if fully withdrawn
        if (vault.shares == 0) {
            _removeVaultFromIntegration(uuid, integration);
        }

        // Withdraw from DLCManager with adjusted amount
        dlcManager.withdraw(uuid, withdrawAmount);
        emit VaultWithdrawn(uuid, withdrawAmount);
    }

    function _harvestRewardsForVault(bytes32 uuid) internal {
        VaultInfo storage vault = _vaults[uuid];
        address integration = vault.integration;
        Integration storage integ = integrations[integration];

        // Get and claim rewards from integration
        uint256[] memory amounts = integ.strategy.claimRewards();
        address[] memory rewardAddresses = integ.strategy.getRewardTokens();
        require(
            amounts.length == rewardAddresses.length,
            "Invalid reward data"
        );

        // Process each reward token
        for (uint256 i = 0; i < amounts.length; i++) {
            address rewardAddress = rewardAddresses[i];
            uint256 amount = amounts[i];

            if (!rewardTokens[rewardAddress].isActive) {
                continue;
            }

            // Calculate this vault's share of the rewards
            if (amount > 0 && vault.shares > 0) {
                UserReward storage reward = vault.rewards[rewardAddress];
                uint256 vaultReward = (amount * vault.shares) /
                    integ.totalShares;
                reward.pendingAmount += vaultReward;
                reward.lastClaimedAt = block.timestamp;

                emit RewardsHarvested(
                    integration,
                    rewardAddress,
                    address(this),
                    vaultReward
                );
            }
        }
    }

    function harvestRewardsForIntegration(
        address integration
    ) external onlyRole(HARVESTER_ROLE) nonReentrant whenNotPaused {
        require(integrations[integration].isActive, "Integration not active");

        bytes32[] memory activeVaults = _getVaultsForIntegration(integration);
        for (uint256 i = 0; i < activeVaults.length; i++) {
            if (_vaults[activeVaults[i]].shares > 0) {
                _harvestRewardsForVault(activeVaults[i]);
            }
        }
    }

    // Claim rewards (ERC20s only)
    // TODO: add auth/a way for users to claim their rewards
    // So, it would not be msg.sender who gets this
    function claimRewards(
        bytes32 uuid,
        address rewardToken
    ) external nonReentrant whenNotPaused {
        VaultInfo storage vault = _vaults[uuid];
        UserReward storage reward = vault.rewards[rewardToken];
        require(reward.pendingAmount > 0, "No rewards to claim");

        uint256 amount = reward.pendingAmount;
        reward.pendingAmount = 0;

        require(
            IERC20(rewardToken).transfer(msg.sender, amount),
            "Reward transfer failed"
        );

        emit RewardsClaimed(uuid, rewardToken, amount);
    }

    ////////////////////////////////////////////////////////////////
    //                        INTEGRATIONS                        //
    ////////////////////////////////////////////////////////////////

    function setIntegration(
        address integration,
        address[] calldata supportedRewards
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // Validate reward tokens
        for (uint256 i = 0; i < supportedRewards.length; i++) {
            require(
                rewardTokens[supportedRewards[i]].isActive,
                "Invalid reward token"
            );
        }

        integrations[integration] = Integration({
            strategy: IIntegration(integration),
            isActive: true,
            totalShares: integrations[integration].totalShares, // Preserve existing shares if any
            supportedRewardTokens: supportedRewards,
            vaults: _getVaultsForIntegration(integration)
        });

        // Update active integrations list if new
        if (!_isInActiveIntegrations(integration)) {
            activeIntegrations.push(integration);
        }

        emit IntegrationAdded(integration, supportedRewards);
    }

    // Allocate dlcBTC to the vault's integration
    function allocateToIntegration(
        bytes32 uuid
    ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        VaultInfo storage vault = _vaults[uuid];
        address integration = vault.integration;
        require(integration != address(0), "No integration set");
        require(integrations[integration].isActive, "Integration not active");

        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        require(dlc.valueMinted > 0, "Vault not funded");

        uint256 unallocated = dlc.valueMinted - vault.allocated;
        require(unallocated > 0, "Nothing to allocate");

        require(dlcBTC.approve(integration, unallocated), "Approval failed");

        uint256 shares = integrations[integration].strategy.deposit(
            unallocated
        );

        vault.shares += shares;
        vault.allocated += unallocated;
        integrations[integration].totalShares += shares;

        emit SharesAllocated(uuid, integration, shares);
    }

    function _addVaultToIntegration(
        bytes32 uuid,
        address integration
    ) internal {
        VaultInfo storage vault = _vaults[uuid];
        if (vault.integrationIndex == 0) {
            integrations[integration].vaults.push(uuid);
            vault.integrationIndex = integrations[integration].vaults.length;
        }
    }

    function _removeVaultFromIntegration(
        bytes32 uuid,
        address integration
    ) internal {
        VaultInfo storage vault = _vaults[uuid];
        uint256 index = vault.integrationIndex;

        if (index > 0) {
            index--; // Convert from 1-based to 0-based

            // Get the array of vaults for this integration
            bytes32[] storage vaults = integrations[integration].vaults;

            // If this isn't the last element, move the last element to this position
            if (index != vaults.length - 1) {
                bytes32 lastVault = vaults[vaults.length - 1];
                vaults[index] = lastVault;
                _vaults[lastVault].integrationIndex = index + 1; // Update to 1-based index
            }

            // Remove the last element
            vaults.pop();
            vault.integrationIndex = 0;
        }
    }

    function _isInActiveIntegrations(
        address integration
    ) internal view returns (bool) {
        for (uint256 i = 0; i < activeIntegrations.length; i++) {
            if (activeIntegrations[i] == integration) {
                return true;
            }
        }
        return false;
    }

    function getIntegrationVaults(
        address integration
    ) external view returns (bytes32[] memory) {
        return integrations[integration].vaults;
    }

    function _getVaultsForIntegration(
        address integration
    ) internal view returns (bytes32[] memory) {
        return integrations[integration].vaults;
    }

    ////////////////////////////////////////////////////////////////
    //                      VAULT FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    function getVaultShares(bytes32 uuid) external view returns (uint256) {
        return _vaults[uuid].shares;
    }

    function getVaultIntegration(bytes32 uuid) external view returns (address) {
        return _vaults[uuid].integration;
    }

    function getVaultReward(
        bytes32 uuid,
        address rewardToken
    ) external view returns (uint256 lastClaimedAt, uint256 pendingAmount) {
        UserReward storage reward = _vaults[uuid].rewards[rewardToken];
        return (reward.lastClaimedAt, reward.pendingAmount);
    }

    function getVaultAllocationDetails(
        bytes32 uuid
    )
        external
        view
        returns (uint256 valueMinted, uint256 allocated, uint256 unallocated)
    {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        VaultInfo storage vault = _vaults[uuid];

        valueMinted = dlc.valueMinted;
        allocated = vault.allocated;
        unallocated = valueMinted - allocated;
    }

    function getUnallocatedAmount(bytes32 uuid) public view returns (uint256) {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        return dlc.valueMinted - _vaults[uuid].allocated;
    }

    function getPendingIntegrationRewards(
        address integration
    )
        external
        view
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        require(integrations[integration].isActive, "Integration not active");
        Integration storage integ = integrations[integration];

        tokens = integ.strategy.getRewardTokens();
        amounts = integ.strategy.getPendingRewards();
    }

    ////////////////////////////////////////////////////////////////
    //                      ADMIN FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    // Reward token management
    function addRewardToken(
        address token
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!rewardTokens[token].isActive, "Token already added");

        // Verify it's an ERC20
        IERC20(token).totalSupply(); // Will revert if not ERC20

        rewardTokens[token] = RewardToken({
            tokenAddress: token,
            isActive: true
        });

        emit RewardTokenAdded(token);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    ////////////////////////////////////////////////////////////////
    //                        UTILITIES                           //
    ////////////////////////////////////////////////////////////////

    // Required interface implementations
    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(
            ERC165Upgradeable,
            AccessControlDefaultAdminRulesUpgradeable,
            IERC165
        )
        returns (bool)
    {
        return
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
