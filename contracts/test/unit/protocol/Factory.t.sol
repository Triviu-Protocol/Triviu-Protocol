// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TriviuVault} from "../../../src/vault/TriviuVault.sol";
import {VaultFactory} from "../../../src/protocol/VaultFactory.sol";
import {EscapeHatch} from "../../../src/protocol/EscapeHatch.sol";
import {ImplementationRegistry} from "../../../src/protocol/ImplementationRegistry.sol";
import {ProtocolRegistry} from "../../../src/protocol/ProtocolRegistry.sol";
import {IVaultFactoryEE} from "../../../src/protocol/interfaces/IVaultFactoryEE.sol";
import {IEscapeHatchEE} from "../../../src/protocol/interfaces/IEscapeHatchEE.sol";

import {MockERC20} from "../../util/Mocks.sol";

/// @notice The factory: predictable address, owner recorded at birth, implementation pinned.
contract VaultFactoryTest is Test {
    VaultFactory private factory;
    TriviuVault private implementation;
    EscapeHatch private hatch;

    address private admin = makeAddr("admin");
    address private treasury = makeAddr("treasury");
    address private owner = makeAddr("owner");

    function setUp() public {
        hatch = new EscapeHatch();

        vm.startPrank(admin);
        ProtocolRegistry registry = new ProtocolRegistry(admin, treasury, 50);
        ImplementationRegistry implRegistry = new ImplementationRegistry(admin);
        vm.stopPrank();

        implementation = new TriviuVault(registry, implRegistry, address(hatch));
        factory = new VaultFactory(address(implementation));
    }

    function test_theImplementationIsImmutableAndMustBeAContract() public {
        assertEq(factory.IMPLEMENTATION(), address(implementation));

        vm.expectRevert(IVaultFactoryEE.ImplementationIsNotAContract.selector);
        new VaultFactory(makeAddr("nothing"));
    }

    function test_theAddressIsKnownBeforeTheVaultExists() public {
        address predicted = factory.vaultAddress(owner, 0);
        assertEq(predicted.code.length, 0);

        address created = factory.createVault(owner, 0);

        assertEq(created, predicted);
        assertGt(created.code.length, 0);
    }

    function test_theVaultIsBornInitialized() public {
        TriviuVault vault = TriviuVault(factory.createVault(owner, 0));

        assertEq(vault.owner(), owner);
        assertEq(vault.interfaceVersion(), 1);
        assertEq(address(vault.REGISTRY()), address(implementation.REGISTRY()));
    }

    function test_theSameOwnerAndIndexCannotBeCreatedTwice() public {
        factory.createVault(owner, 0);

        vm.expectRevert();
        factory.createVault(owner, 0);
    }

    function test_theIndexSeparatesVaultsOfTheSameOwner() public {
        address first = factory.createVault(owner, 0);
        address second = factory.createVault(owner, 1);

        assertNotEq(first, second);
        assertEq(TriviuVault(first).owner(), owner);
        assertEq(TriviuVault(second).owner(), owner);
    }

    function test_theCreationIsAnnounced() public {
        address predicted = factory.vaultAddress(owner, 7);

        vm.expectEmit(true, true, true, false);
        emit IVaultFactoryEE.VaultCreated(predicted, owner, 7);
        factory.createVault(owner, 7);
    }

    function testFuzz_thePredictionAlwaysMatches(address who, uint256 index) public {
        vm.assume(who != address(0));

        address predicted = factory.vaultAddress(who, index);
        assertEq(factory.createVault(who, index), predicted);
    }

    /// @dev The implementation is not a vault: the initializers are switched off on it.
    function test_theImplementationItselfCannotBeInitialized() public {
        vm.expectRevert();
        implementation.initialize(owner);
    }
}

/// @notice The refuge: reads the owner from the `VaultConfig` slot, and only they withdraw.
contract EscapeHatchTest is Test {
    EscapeHatch private hatch;
    MockERC20 private token;

    address private owner = makeAddr("owner");
    address private stranger = makeAddr("stranger");

    /// @dev The same literal as in `VaultConfig` and `BaseTest`: the copies are tied together here.
    bytes32 private constant VAULT_CONFIG_STORAGE = 0x64ad1f80561b0cd1f1b2fb404d5a36956f5f50507b9d5b3a823940b55cbcb000;

    function setUp() public {
        hatch = new EscapeHatch();
        token = new MockERC20("Token", "TKN", 6);
    }

    function test_theSlotIsTheErc7201NamespaceOfTheVaultConfig() public pure {
        bytes32 expected =
            keccak256(abi.encode(uint256(keccak256("triviu.storage.VaultConfig")) - 1)) & ~bytes32(uint256(0xff));

        assertEq(VAULT_CONFIG_STORAGE, expected);
    }

    function test_withoutTheProxyStorageThereIsNoOwner() public view {
        assertEq(hatch.owner(), address(0));
    }

    function test_onlyTheOwnerWithdraws() public {
        vm.store(address(hatch), VAULT_CONFIG_STORAGE, bytes32(uint256(uint160(owner))));
        token.mint(address(hatch), 100e6);

        assertEq(hatch.owner(), owner);

        vm.prank(stranger);
        vm.expectRevert(IEscapeHatchEE.NotOwner.selector);
        hatch.withdraw(IERC20(address(token)), 100e6, stranger);

        vm.prank(owner);
        hatch.withdraw(IERC20(address(token)), 100e6, owner);

        assertEq(token.balanceOf(owner), 100e6);
    }

    function test_theWithdrawalIsAnnounced() public {
        vm.store(address(hatch), VAULT_CONFIG_STORAGE, bytes32(uint256(uint160(owner))));
        token.mint(address(hatch), 1e6);

        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit IEscapeHatchEE.Withdrawn(address(token), owner, 1e6);
        hatch.withdraw(IERC20(address(token)), 1e6, owner);
    }

    /// @dev The refuge's surface is the product: two functions, and nothing else that can be called.
    function test_theHatchAbiHasExactlyTwoFunctions() public view {
        string memory artifact = vm.readFile("out/EscapeHatch.sol/EscapeHatch.json");

        uint256 functions;
        for (uint256 i = 0; i < 64; i++) {
            string memory pointer = string.concat(".abi[", vm.toString(i), "].type");
            if (!vm.keyExistsJson(artifact, pointer)) break;

            if (keccak256(bytes(vm.parseJsonString(artifact, pointer))) == keccak256("function")) functions++;
        }

        assertEq(functions, 2);
    }
}
