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
        uint256 pendingAmount; // For ERC20s
    }

    struct VaultInfo {
        mapping(address => uint256) integrationShares; // integration -> shares
        mapping(address => mapping(address => UserReward)) rewards; // integration -> token -> reward
        uint256 totalAllocated; // Track total amount allocated to integrations
    }

    struct Integration {
        IIntegration strategy;
        bool isActive;
        uint256 totalShares;
        address[] supportedRewardTokens;
    }

    mapping(bytes32 => VaultInfo) internal _vaults;
    mapping(address => Integration) public integrations;
    mapping(address => RewardToken) public rewardTokens;
    address[] public activeIntegrations;
    mapping(address => bytes32[]) private _integrationVaults; // integration -> array of vault IDs
    mapping(address => mapping(bytes32 => uint256)) private _vaultIndices; // integration -> vault -> index in array

    uint256 public totalValueLocked;
    uint256[50] private __gap;

    ////////////////////////////////////////////////////////////////
    //                          EVENTS                            //
    ////////////////////////////////////////////////////////////////

    event PendingVaultCreated(
        bytes32 indexed uuid,
        string taprootPubKey,
        string withdrawalTxId
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
        address indexed integration,
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
        string calldata withdrawalTxId
    )
        external
        onlyRole(ATTESTOR_ROLE)
        nonReentrant
        whenNotPaused
        returns (bytes32)
    {
        // Create pending vault in DLCManager
        bytes32 _uuid = dlcManager.setupPendingVault(
            taprootPubKey,
            withdrawalTxId
        );

        // Initialize our tracking (no need to store DLC data)
        _vaults[_uuid].integrationShares[address(0)] = 0; // Just initialize the mapping

        emit PendingVaultCreated(_uuid, taprootPubKey, withdrawalTxId);
        return _uuid;
    }

    function withdrawFromVault(
        bytes32 uuid,
        uint256 amount
    ) external onlyRole(ATTESTOR_ROLE) nonReentrant whenNotPaused {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        require(dlc.uuid != bytes32(0), "Vault does not exist");

        // First withdraw from any active integrations
        _withdrawFromIntegrations(dlc.uuid, amount);

        // Then withdraw from DLCManager
        dlcManager.withdraw(dlc.uuid, amount);

        emit VaultWithdrawn(dlc.uuid, amount);
    }

    // Harvesting rewards explained:
    // 1. External protocols (like Enzyme, YieldNest) generate rewards
    // 2. A harvester (automated or manual) collects these rewards
    // 3. The harvester calls this function to distribute rewards to vault holders
    function harvestRewards(
        address integration
    ) external onlyRole(HARVESTER_ROLE) nonReentrant whenNotPaused {
        require(integrations[integration].isActive, "Integration not active");
        Integration storage integ = integrations[integration];

        // Claim rewards from integration
        uint256[] memory amounts = integ.strategy.claimRewards();
        address[] memory rewardAddresses = integ.strategy.getRewardTokens();
        require(
            amounts.length == rewardAddresses.length,
            "Invalid reward data"
        );

        uint256 totalShares = integ.totalShares;
        bytes32[] memory activeVaults = _getActiveVaultsForIntegration(
            integration
        );

        // Distribute each reward token
        for (uint256 i = 0; i < amounts.length; i++) {
            address rewardAddress = rewardAddresses[i];
            uint256 amount = amounts[i];

            // Skip unsupported reward tokens instead of reverting
            if (!rewardTokens[rewardAddress].isActive) {
                continue;
            }

            // Only distribute and emit events for supported tokens
            for (uint256 j = 0; j < activeVaults.length; j++) {
                bytes32 uuid = activeVaults[j];
                uint256 vaultShares = _vaults[uuid].integrationShares[
                    integration
                ];

                if (vaultShares > 0) {
                    UserReward storage reward = _vaults[uuid].rewards[
                        integration
                    ][rewardAddress];
                    uint256 vaultReward = (amount * vaultShares) / totalShares;
                    reward.pendingAmount += vaultReward;
                    reward.lastClaimedAt = block.timestamp;
                }
            }

            emit RewardsHarvested(
                integration,
                rewardAddress,
                msg.sender,
                amount
            );
        }
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

    // Claim rewards (ERC20s only)
    // TODO: add auth/a way for users to claim their rewards
    // So, it would not be msg.sender who gets this
    function claimRewards(
        bytes32 uuid,
        address integration,
        address rewardToken
    ) external nonReentrant whenNotPaused {
        UserReward storage reward = _vaults[uuid].rewards[integration][
            rewardToken
        ];
        require(reward.pendingAmount > 0, "No rewards to claim");

        uint256 amount = reward.pendingAmount;
        reward.pendingAmount = 0;

        require(
            IERC20(rewardToken).transfer(msg.sender, amount),
            "Reward transfer failed"
        );

        emit RewardsClaimed(uuid, integration, rewardToken, amount);
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
            supportedRewardTokens: supportedRewards
        });

        // Update active integrations list if new
        if (!_isInActiveIntegrations(integration)) {
            activeIntegrations.push(integration);
        }

        emit IntegrationAdded(integration, supportedRewards);
    }

    // Allocate dlcBTC to an integration
    function allocateToIntegration(
        bytes32 uuid,
        address integration
    ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        require(integrations[integration].isActive, "Integration not active");

        // Get current vault state
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        require(dlc.valueMinted > 0, "Vault not funded");

        // Calculate amount available to allocate
        uint256 unallocated = dlc.valueMinted - _vaults[uuid].totalAllocated;
        require(unallocated > 0, "Nothing to allocate");

        // First approve the integration to spend dlcBTC
        require(dlcBTC.approve(integration, unallocated), "Approval failed");

        // Then deposit through the integration
        uint256 shares = integrations[integration].strategy.deposit(
            unallocated
        );

        // Update share accounting
        _vaults[uuid].integrationShares[integration] += shares;
        _vaults[uuid].totalAllocated += unallocated;
        integrations[integration].totalShares += shares;

        _addVaultToIntegration(integration, uuid);

        emit SharesAllocated(uuid, integration, shares);
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

    function _withdrawFromIntegrations(
        bytes32 uuid,
        uint256 totalAmount
    ) internal {
        uint256 remainingAmount = totalAmount;

        for (
            uint256 i = 0;
            i < activeIntegrations.length && remainingAmount > 0;
            i++
        ) {
            address integration = activeIntegrations[i];
            uint256 shareAmount = _vaults[uuid].integrationShares[integration];

            if (shareAmount > 0) {
                Integration storage integ = integrations[integration];
                uint256 withdrawAmount = (shareAmount * totalAmount) /
                    integ.totalShares;

                if (withdrawAmount > 0) {
                    uint256 received = integ.strategy.withdraw(withdrawAmount);
                    remainingAmount -= received;
                    _vaults[uuid].integrationShares[
                        integration
                    ] -= withdrawAmount;
                    _vaults[uuid].totalAllocated -= received; // Update allocated tracking
                    integ.totalShares -= withdrawAmount;

                    if (_vaults[uuid].integrationShares[integration] == 0) {
                        _removeVaultFromIntegration(integration, uuid);
                    }
                }
            }
        }

        require(remainingAmount == 0, "Insufficient liquidity in integrations");
    }

    // Helper function to get active _vaults for an integration
    function _getActiveVaultsForIntegration(
        address integration
    ) internal view returns (bytes32[] memory) {
        bytes32[] memory allVaults = _integrationVaults[integration];
        uint256 activeCount = 0;

        // First count active vaults
        for (uint256 i = 0; i < allVaults.length; i++) {
            if (_vaults[allVaults[i]].integrationShares[integration] > 0) {
                activeCount++;
            }
        }

        // Create result array with exact size
        bytes32[] memory activeVaults = new bytes32[](activeCount);
        uint256 currentIndex = 0;

        // Fill result array
        for (
            uint256 i = 0;
            i < allVaults.length && currentIndex < activeCount;
            i++
        ) {
            if (_vaults[allVaults[i]].integrationShares[integration] > 0) {
                activeVaults[currentIndex] = allVaults[i];
                currentIndex++;
            }
        }

        return activeVaults;
    }

    ////////////////////////////////////////////////////////////////
    //                      VAULT FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    function getVaultShares(
        bytes32 uuid,
        address integration
    ) external view returns (uint256) {
        return _vaults[uuid].integrationShares[integration];
    }

    function getVaultReward(
        bytes32 uuid,
        address integration,
        address rewardToken
    ) external view returns (uint256 lastClaimedAt, uint256 pendingAmount) {
        UserReward storage reward = _vaults[uuid].rewards[integration][
            rewardToken
        ];
        return (reward.lastClaimedAt, reward.pendingAmount);
    }

    // Helper function to get total shares in an integration for a vault
    function getVaultTotalShares(
        bytes32 uuid
    ) external view returns (uint256 totalShares) {
        for (uint256 i = 0; i < activeIntegrations.length; i++) {
            totalShares += _vaults[uuid].integrationShares[
                activeIntegrations[i]
            ];
        }
    }

    function getUnallocatedAmount(bytes32 uuid) public view returns (uint256) {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        return dlc.valueMinted - _vaults[uuid].totalAllocated;
    }

    function getVaultAllocationDetails(
        bytes32 uuid
    )
        external
        view
        returns (
            uint256 totalMinted,
            uint256 totalAllocated,
            uint256 unallocated
        )
    {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        totalMinted = dlc.valueMinted;
        totalAllocated = _vaults[uuid].totalAllocated;
        unallocated = totalMinted - totalAllocated;
    }

    function _addVaultToIntegration(
        address integration,
        bytes32 uuid
    ) internal {
        if (_vaultIndices[integration][uuid] == 0) {
            // 0 means not found
            _integrationVaults[integration].push(uuid);
            _vaultIndices[integration][uuid] = _integrationVaults[integration]
                .length;
        }
    }

    function _removeVaultFromIntegration(
        address integration,
        bytes32 uuid
    ) internal {
        uint256 index = _vaultIndices[integration][uuid];
        if (index > 0) {
            // If vault exists in array
            index--; // Convert from 1-based to 0-based index

            // Get the last element
            uint256 lastIndex = _integrationVaults[integration].length - 1;
            if (index != lastIndex) {
                // Move last element to the removed element's position
                bytes32 lastVault = _integrationVaults[integration][lastIndex];
                _integrationVaults[integration][index] = lastVault;
                _vaultIndices[integration][lastVault] = index + 1; // Update to 1-based index
            }

            // Remove last element
            _integrationVaults[integration].pop();
            delete _vaultIndices[integration][uuid];
        }
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
