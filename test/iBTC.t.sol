// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

// lets ignore [func-name-mixedcase] from the linter
// solhint-disable func-name-mixedcase

import "forge-std/Test.sol";
import "../contracts/IBTC.sol";
import "../contracts/DLCManager.sol";

contract IBTCTest is Test {
    IBTC public iBTC;
    DLCManager public dlcManager;

    address public deployer;
    address public user;
    address public someRandomAccount;

    address public attestor1;
    address public attestor2;
    address public attestor3;
    address[] public attestors;

    uint256 public constant DEPOSIT = 100000000; // 1 BTC
    string public constant BTC_FEE_RECIPIENT = "0x";

    bytes32 public constant MOCK_UUID =
        0x96eecb386fb10e82f510aaf3e2b99f52f8dcba03f9e0521f7551b367d8ad4967;
    string public constant MOCK_BTC_TX_ID =
        "0x1234567890123456789012345678901234567890123456789012345678901234";
    string public constant MOCK_TAPROOT_PUBKEY =
        "0x1234567890123456789012345678901234567890123456789012345678901234";

    function setUp() public {
        deployer = address(this);
        user = makeAddr("user");
        someRandomAccount = makeAddr("someRandomAccount");

        attestor1 = makeAddr("attestor1");
        attestor2 = makeAddr("attestor2");
        attestor3 = makeAddr("attestor3");
        attestors = new address[](3);
        attestors[0] = attestor1;
        attestors[1] = attestor2;
        attestors[2] = attestor3;

        // Deploy IBTC
        iBTC = new IBTC();
        // iBTC.initialize();

        // Deploy DLCManager
        dlcManager = new DLCManager();
        // dlcManager.initialize(deployer, deployer, 3, iBTC, BTC_FEE_RECIPIENT);
    }

    function test_Deploy() public {
        assertTrue(address(iBTC) != address(0));
    }

    function test_InitialOwnership() public {
        assertEq(iBTC.owner(), deployer);
    }

    function test_Decimals() public {
        assertEq(iBTC.decimals(), 8);
    }

    function test_InitialSupply() public {
        assertEq(iBTC.totalSupply(), 0);
    }

    function test_RevertUnauthorizedMint() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("NotAuthorized()"));
        iBTC.mint(user, DEPOSIT);
    }

    function test_RevertUnauthorizedBurn() public {
        vm.prank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        iBTC.burn(user, DEPOSIT);
    }

    function test_OwnerCanMint() public {
        iBTC.mint(user, DEPOSIT);
        assertEq(iBTC.balanceOf(user), DEPOSIT);
    }

    function test_OwnerCanBurn() public {
        iBTC.mint(user, DEPOSIT);
        iBTC.burn(user, DEPOSIT);
        assertEq(iBTC.balanceOf(user), 0);
    }

    function test_AfterOwnershipTransfer() public {
        // Initial setup
        iBTC.mint(user, DEPOSIT);
        iBTC.transferOwnership(address(dlcManager));

        // Verify ownership
        assertEq(iBTC.owner(), address(dlcManager));

        // Test previous owner can't mint
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSignature("NotAuthorized()"));
        iBTC.mint(user, DEPOSIT);

        // Test previous owner can't burn
        vm.prank(deployer);
        vm.expectRevert("Ownable: caller is not the owner");
        iBTC.burn(user, DEPOSIT);
    }

    function test_DLCManagerCanMintAndBurn() public {
        // Initial setup
        iBTC.mint(user, DEPOSIT);
        iBTC.transferOwnership(address(dlcManager));
        uint256 existingBalance = iBTC.balanceOf(user);

        // Whitelist user
        vm.prank(deployer);
        dlcManager.whitelistAddress(user);

        // Setup vault
        vm.prank(user);
        bytes32 _uuid = dlcManager.setupVault();

        // Set signers
        for (uint i = 0; i < attestors.length; i++) {
            vm.prank(deployer);
            dlcManager.grantRole(keccak256("APPROVED_SIGNER"), attestors[i]);
        }

        // Create signatures (this is simplified as we can't replicate the exact signature verification)
        bytes[] memory signaturesPending = new bytes[](3);
        bytes[] memory signaturesFunding = new bytes[](3);

        // Set status to pending
        vm.prank(attestor1);
        dlcManager.setStatusPending(
            _uuid,
            MOCK_BTC_TX_ID,
            signaturesPending,
            MOCK_TAPROOT_PUBKEY,
            0
        );

        // Set status to funded
        vm.prank(attestor1);
        dlcManager.setStatusFunded(
            _uuid,
            MOCK_BTC_TX_ID,
            signaturesFunding,
            DEPOSIT
        );

        // Verify mint
        assertEq(iBTC.balanceOf(user), existingBalance + DEPOSIT);

        // Test burn through withdrawal
        vm.prank(user);
        dlcManager.withdraw(MOCK_UUID, DEPOSIT);

        // Verify burn
        assertEq(iBTC.balanceOf(user), existingBalance);
    }
}
