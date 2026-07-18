// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";

/// The Registry's whole promise: no parameter changes without ownership,
/// and no change at all without the URL of its public pull request.
contract ParameterRegistryTest is Test {
    string constant PR = "https://github.com/Triviu-Protocol/Triviu-Protocol/pull/1";

    ParameterRegistry registry;
    address stranger;

    function setUp() public {
        registry = new ParameterRegistry(30, 3.1e15);
        stranger = makeAddr("stranger");
    }

    function test_ConstructorSetsOwnerAndParams() public view {
        assertEq(registry.owner(), address(this));
        assertEq(registry.maxSlippageBps(), 30);
        assertEq(registry.defaultMinProfit(), 3.1e15);
    }

    function test_RevertWhen_NotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(ParameterRegistry.NotOwner.selector);
        registry.setToken(address(0xA11CE), true, PR);
    }

    function test_RevertWhen_EmptyPrUrl() public {
        // A parameter without a public PR does not exist — by construction.
        vm.expectRevert(ParameterRegistry.EmptyPrUrl.selector);
        registry.setToken(address(0xA11CE), true, "");
    }

    function test_SetToken_StoresAndEmitsPrUrl() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit ParameterRegistry.TokenAllowed(address(0xA11CE), true, PR);
        registry.setToken(address(0xA11CE), true, PR);
        assertTrue(registry.isAllowedToken(address(0xA11CE)));

        registry.setToken(address(0xA11CE), false, PR);
        assertFalse(registry.isAllowedToken(address(0xA11CE)));
    }

    function test_SetTarget_StoresAndEmitsPrUrl() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit ParameterRegistry.TargetAllowed(address(0xD3C5), true, PR);
        registry.setTarget(address(0xD3C5), true, PR);
        assertTrue(registry.isAllowedTarget(address(0xD3C5)));
    }

    function test_SetMaxSlippage_StoresAndEmits() public {
        vm.expectEmit(false, false, false, true, address(registry));
        emit ParameterRegistry.MaxSlippageSet(55, PR);
        registry.setMaxSlippage(55, PR);
        assertEq(registry.maxSlippageBps(), 55);
    }

    function test_SetDefaultMinProfit_StoresAndEmits() public {
        vm.expectEmit(false, false, false, true, address(registry));
        emit ParameterRegistry.DefaultMinProfitSet(7e15, PR);
        registry.setDefaultMinProfit(7e15, PR);
        assertEq(registry.defaultMinProfit(), 7e15);
    }

    function test_TransferOwner_RotatesAuthority() public {
        address multisig = makeAddr("multisig");

        vm.expectEmit(true, true, false, false, address(registry));
        emit ParameterRegistry.OwnerTransferred(address(this), multisig);
        registry.transferOwner(multisig);
        assertEq(registry.owner(), multisig);

        // The previous owner is a stranger now.
        vm.expectRevert(ParameterRegistry.NotOwner.selector);
        registry.setToken(address(0xA11CE), true, PR);

        vm.prank(multisig);
        registry.setToken(address(0xA11CE), true, PR);
        assertTrue(registry.isAllowedToken(address(0xA11CE)));
    }
}
