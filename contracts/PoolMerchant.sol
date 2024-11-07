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
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

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
    using SafeMath for uint256;

    ////////////////////////////////////////////////////////////////
    //                      STATE VARIABLES                       //
    ////////////////////////////////////////////////////////////////

    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
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
    mapping(string => bytes32[]) public vaultsByTaprootPubKey;
    mapping(address => Integration) public integrations;
    mapping(address => RewardToken) public rewardTokens;
    mapping(bytes32 => bytes32) public uuidByTaprootAndIntegration; // taproot-integration -> uuid
    address[] public activeIntegrations;

    uint256[50] private __gap;

    ////////////////////////////////////////////////////////////////
    //                          EVENTS                            //
    ////////////////////////////////////////////////////////////////

    event PendingVaultCreated(
        bytes32 indexed uuid,
        string taprootPubKey,
        string wdPSBT,
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
        string calldata wdPSBT,
        address integration
    )
        external
        onlyRole(ATTESTOR_ROLE)
        nonReentrant
        whenNotPaused
        returns (bytes32)
    {
        require(integrations[integration].isActive, "Integration not active");

        bytes32 mappingKey = _createMappingKey(taprootPubKey, integration);
        require(
            uuidByTaprootAndIntegration[mappingKey] == bytes32(0),
            "Vault already exists for this taproot-integration pair"
        );

        bytes32 _uuid = dlcManager.setupPendingVault(taprootPubKey, wdPSBT);

        _vaults[_uuid].integration = integration;
        _addVaultToIntegration(_uuid, integration);

        vaultsByTaprootPubKey[taprootPubKey].push(_uuid);
        uuidByTaprootAndIntegration[mappingKey] = _uuid;

        emit PendingVaultCreated(_uuid, taprootPubKey, wdPSBT, integration);
        return _uuid;
    }

    function withdrawFromVault(
        string calldata taprootPubKey,
        address integration,
        uint256 amount
    ) external onlyRole(ATTESTOR_ROLE) nonReentrant whenNotPaused {
        bytes32 uuid = uuidByTaprootAndIntegration[
            _createMappingKey(taprootPubKey, integration)
        ];
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        require(dlc.uuid != bytes32(0), "Vault does not exist");

        VaultInfo storage vault = _vaults[uuid];
        require(amount <= vault.allocated, "Amount exceeds allocation");

        Integration storage integ = integrations[integration];

        // Harvest any pending rewards
        if (vault.shares > 0) {
            _harvestRewardsForVault(uuid);
        }

        // Withdraw from integration
        uint256 received = integ.strategy.withdraw(amount);

        vault.shares = vault.shares.sub(received, "Insufficient shares");
        vault.allocated = vault.allocated.sub(
            received,
            "Insufficient allocation"
        );
        integrations[integration].totalShares = integrations[integration]
            .totalShares
            .sub(received, "Insufficient total shares");

        // Clean up if fully withdrawn
        if (vault.shares == 0) {
            _removeVaultFromIntegration(uuid, integration);
        }

        // Withdraw from DLCManager with adjusted received
        dlcManager.withdraw(uuid, received);
        emit VaultWithdrawn(uuid, received);
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
                uint256 vaultReward = amount.mul(vault.shares).div(
                    integ.totalShares
                );
                reward.pendingAmount = reward.pendingAmount.add(vaultReward);

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
        string calldata taprootPubKey,
        address integration,
        address rewardToken
    ) external nonReentrant whenNotPaused {
        bytes32 uuid = uuidByTaprootAndIntegration[
            _createMappingKey(taprootPubKey, integration)
        ];
        VaultInfo storage vault = _vaults[uuid];
        UserReward storage reward = vault.rewards[rewardToken];
        require(reward.pendingAmount > 0, "No rewards to claim");

        uint256 amount = reward.pendingAmount;
        reward.pendingAmount = 0;
        reward.lastClaimedAt = block.timestamp;

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
        string calldata taprootPubKey,
        address integration
    ) external onlyRole(ATTESTOR_ROLE) nonReentrant whenNotPaused {
        bytes32 uuid = uuidByTaprootAndIntegration[
            _createMappingKey(taprootPubKey, integration)
        ];
        VaultInfo storage vault = _vaults[uuid];
        require(integrations[integration].isActive, "Integration not active");

        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        require(dlc.valueMinted > 0, "Vault not funded");

        uint256 unallocated = dlc.valueMinted.sub(
            vault.allocated,
            "Already fully allocated"
        );
        require(unallocated > 0, "Nothing to allocate");

        require(dlcBTC.approve(integration, unallocated), "Approval failed");

        uint256 shares = integrations[integration].strategy.deposit(
            unallocated
        );

        vault.shares = vault.shares.add(shares);
        vault.allocated = vault.allocated.add(unallocated);
        integrations[integration].totalShares = integrations[integration]
            .totalShares
            .add(shares);

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

    function getVaultByTaprootAndIntegration(
        string calldata taprootPubKey,
        address integration
    ) external view returns (bytes32) {
        return
            uuidByTaprootAndIntegration[
                _createMappingKey(taprootPubKey, integration)
            ];
    }

    ////////////////////////////////////////////////////////////////
    //                      VAULT FUNCTIONS                       //
    ////////////////////////////////////////////////////////////////

    function getVaultShares(bytes32 uuid) external view returns (uint256) {
        return _vaults[uuid].shares;
    }

    function getVaultSharesByTaprootAndIntegration(
        string calldata taprootPubKey,
        address integration
    ) external view returns (uint256) {
        return
            _vaults[
                uuidByTaprootAndIntegration[
                    _createMappingKey(taprootPubKey, integration)
                ]
            ].shares;
    }

    function getVaultIntegration(bytes32 uuid) external view returns (address) {
        return _vaults[uuid].integration;
    }

    function getVaultIntegrationByTaprootAndIntegration(
        string calldata taprootPubKey,
        address integration
    ) external view returns (address) {
        return
            _vaults[
                uuidByTaprootAndIntegration[
                    _createMappingKey(taprootPubKey, integration)
                ]
            ].integration;
    }

    function getVaultReward(
        bytes32 uuid,
        address rewardToken
    ) external view returns (uint256 lastClaimedAt, uint256 pendingAmount) {
        UserReward storage reward = _vaults[uuid].rewards[rewardToken];
        return (reward.lastClaimedAt, reward.pendingAmount);
    }

    function getVaultRewardByTaprootAndIntegration(
        string calldata taprootPubKey,
        address integration,
        address rewardToken
    ) external view returns (uint256 lastClaimedAt, uint256 pendingAmount) {
        UserReward storage reward = _vaults[
            uuidByTaprootAndIntegration[
                _createMappingKey(taprootPubKey, integration)
            ]
        ].rewards[rewardToken];
        return (reward.lastClaimedAt, reward.pendingAmount);
    }

    function getVaultAllocationDetails(
        bytes32 uuid
    )
        public
        view
        returns (uint256 valueMinted, uint256 allocated, uint256 unallocated)
    {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        VaultInfo storage vault = _vaults[uuid];

        valueMinted = dlc.valueMinted;
        allocated = vault.allocated;
        unallocated = valueMinted.sub(
            allocated,
            "Allocation exceeds minted value"
        );
    }

    function getVaultAllocationDetailsByTaprootAndIntegration(
        string calldata taprootPubKey,
        address integration
    )
        external
        view
        returns (uint256 valueMinted, uint256 allocated, uint256 unallocated)
    {
        bytes32 uuid = uuidByTaprootAndIntegration[
            _createMappingKey(taprootPubKey, integration)
        ];
        return getVaultAllocationDetails(uuid);
    }

    function getUnallocatedAmount(bytes32 uuid) public view returns (uint256) {
        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);
        return
            dlc.valueMinted.sub(
                _vaults[uuid].allocated,
                "Allocation exceeds minted value"
            );
    }

    function getUnallocatedAmountByTaprootAndIntegration(
        string calldata taprootPubKey,
        address integration
    ) external view returns (uint256) {
        bytes32 uuid = uuidByTaprootAndIntegration[
            _createMappingKey(taprootPubKey, integration)
        ];
        return getUnallocatedAmount(uuid);
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
    //                      VAULT QUERIES                         //
    ////////////////////////////////////////////////////////////////

    // Get all vault UUIDs for a taproot public key
    function getVaultsByTaprootPubKey(
        string calldata taprootPubKey
    ) external view returns (bytes32[] memory) {
        return vaultsByTaprootPubKey[taprootPubKey];
    }

    // Get details for a specific vault by UUID
    function getVaultDetails(
        bytes32 uuid,
        address[] calldata _rewardTokens
    )
        public
        view
        returns (
            address integration,
            uint256 shares,
            uint256 valueMinted,
            uint256 allocated,
            uint256 unallocated,
            uint256[] memory lastClaimedAt,
            uint256[] memory pendingAmounts
        )
    {
        require(uuid != bytes32(0), "Invalid UUID");
        VaultInfo storage vault = _vaults[uuid];
        require(vault.integration != address(0), "Vault not found");

        DLCLink.DLC memory dlc = dlcManager.getDLC(uuid);

        integration = vault.integration;
        shares = vault.shares;
        valueMinted = dlc.valueMinted;
        allocated = vault.allocated;
        unallocated = valueMinted - allocated;

        // Get reward data
        lastClaimedAt = new uint256[](_rewardTokens.length);
        pendingAmounts = new uint256[](_rewardTokens.length);

        for (uint256 i = 0; i < _rewardTokens.length; i++) {
            UserReward storage reward = vault.rewards[_rewardTokens[i]];
            lastClaimedAt[i] = reward.lastClaimedAt;
            pendingAmounts[i] = reward.pendingAmount;
        }
    }

    function getVaultDetailsByTaprootAndIntegration(
        string calldata taprootPubKey,
        address _integration,
        address[] calldata _rewardTokens
    )
        external
        view
        returns (
            address integration,
            uint256 shares,
            uint256 valueMinted,
            uint256 allocated,
            uint256 unallocated,
            uint256[] memory lastClaimedAt,
            uint256[] memory pendingAmounts
        )
    {
        bytes32 uuid = uuidByTaprootAndIntegration[
            _createMappingKey(taprootPubKey, _integration)
        ];
        return getVaultDetails(uuid, _rewardTokens);
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

    function _createMappingKey(
        string memory taprootPubKey,
        address integration
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(taprootPubKey, integration));
    }

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
