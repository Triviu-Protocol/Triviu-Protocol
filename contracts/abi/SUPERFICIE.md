# Superficie chamavel · Triviu · Polygon PoS (137)

Gerado de `abi/*.json`, que o CI regera e compara byte a byte. Nenhum nome aqui foi
digitado a mao, e as tuplas estao expandidas: `execute(tuple)` nao e assinatura e daria
seletor errado.

Chamadas ao cofre vao para o **endereco do cofre do cliente**, nunca para a implementacao:
o cofre e um proxy ERC-1967 e expoe a ABI de `TriviuVault`. O endereco listado ali e o da
implementacao, e serve para ler codigo, nao para chamar.

## VaultFactory

`0xF4e60C6Bf2c5479935abf1A9F82554E5CD2D843c`

### Escreve

| o que faz | assinatura para o seletor |
|---|---|
| `createVault(address owner, uint256 index) -> address` | `createVault(address,uint256)` |

### Le

| o que faz | assinatura para o seletor |
|---|---|
| `IMPLEMENTATION() -> address` | `IMPLEMENTATION()` |
| `vaultAddress(address owner, uint256 index) -> address` | `vaultAddress(address,uint256)` |

### Eventos

- `VaultCreated(address,address,uint256)`

### Erros (4)

Custom errors. A tela deve decodificar em vez de mostrar `0x...` cru:

  `Create2EmptyBytecode` · `FailedDeployment` · `ImplementationIsNotAContract` · `InsufficientBalance`

---

## TriviuVault

`0x5F5bFe6b6019beACFa95e9778917977881A19c7B`

### Escreve

| o que faz | assinatura para o seletor |
|---|---|
| `acceptOwnership()` | `acceptOwnership()` |
| `addGuard(address guard)` | `addGuard(address)` |
| `adoptEscapeHatch()` | `adoptEscapeHatch()` |
| `cancelUpgrade()` | `cancelUpgrade()` |
| `deposit(address token, uint256 amount)` | `deposit(address,uint256)` |
| `execute(ExecutionParams p)` | `execute((address,address,address,address,uint256,uint64,uint64,uint256,uint256,uint256,uint256,uint256,bytes,bytes32))` |
| `executeAsOwner(Intent intent, ExecutionParams p)` | `executeAsOwner((uint8,address,address,uint256,uint256,uint256),(address,address,address,address,uint256,uint64,uint64,uint256,uint256,uint256,uint256,uint256,bytes,bytes32))` |
| `executeUpgrade()` | `executeUpgrade()` |
| `initialize(address newOwner)` | `initialize(address)` |
| `proposeUpgrade(address implementation)` | `proposeUpgrade(address)` |
| `removeGuard(address guard)` | `removeGuard(address)` |
| `setAllowedAsset(address asset, bool allowed)` | `setAllowedAsset(address,bool)` |
| `setBaseCurrency(address token, bool enabled)` | `setBaseCurrency(address,bool)` |
| `setLimits(uint64 cooldown, uint64 maxValidity, uint16 minRatioBps, uint112 quantum)` | `setLimits(uint64,uint64,uint16,uint112)` |
| `setStrategy(address newStrategy)` | `setStrategy(address)` |
| `transferOwnership(address newOwner)` | `transferOwnership(address)` |
| `withdraw(address token, uint256 amount, address to)` | `withdraw(address,uint256,address)` |

### Le

| o que faz | assinatura para o seletor |
|---|---|
| `ESCAPE_HATCH() -> address` | `ESCAPE_HATCH()` |
| `IMPL_REGISTRY() -> address` | `IMPL_REGISTRY()` |
| `REGISTRY() -> address` | `REGISTRY()` |
| `assetDecimals(address asset) -> uint8` | `assetDecimals(address)` |
| `backing(uint256 lotId) -> uint256` | `backing(uint256)` |
| `baseCurrencyDecimals(address token) -> uint8` | `baseCurrencyDecimals(address)` |
| `configEpoch() -> uint64` | `configEpoch()` |
| `dryRunChecks(uint256 candidateLotId, address base) -> (uint8,address,address,uint256,uint256,uint256)` | `dryRunChecks(uint256,address)` |
| `guards() -> address[]` | `guards()` |
| `interfaceVersion() -> uint16` | `interfaceVersion()` |
| `lastExecAt() -> uint64` | `lastExecAt()` |
| `limits() -> bytes32` | `limits()` |
| `lot(uint256 lotId) -> (address,uint48,address,uint128,uint128)` | `lot(uint256)` |
| `lotCount() -> uint256` | `lotCount()` |
| `nonce() -> uint64` | `nonce()` |
| `owner() -> address` | `owner()` |
| `pendingOwner() -> address` | `pendingOwner()` |
| `pendingUpgrade() -> address, uint64` | `pendingUpgrade()` |
| `strategy() -> address` | `strategy()` |

### Eventos

- `AssetSet(address,uint8,uint64)`
- `BaseCurrencySet(address,uint8,uint64)`
- `Deposited(address,address,uint256)`
- `EscapeHatchAdopted(address)`
- `Executed((bytes32,uint64,uint8,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address))`
- `GuardAdded(address,uint64)`
- `GuardRemoved(address,uint64)`
- `Initialized(uint64)`
- `LimitsSet(bytes32,uint64)`
- `LotClosed(uint256,address,address,uint256,uint256,uint256,bool)`
- `LotOpened(uint256,address,address,uint256,uint256,uint48)`
- `OwnershipTransferStarted(address,address)`
- `OwnershipTransferred(address,address)`
- `RefundDetail(uint256,uint256,uint256,uint256,uint256)`
- `StrategySet(address,uint64)`
- `UpgradeCancelled(address)`
- `UpgradeExecuted(address,uint64)`
- `UpgradeProposed(address,uint64)`
- `Upgraded(address)`
- `Withdrawn(address,address,uint256)`

### Erros (50)

Custom errors. A tela deve decodificar em vez de mostrar `0x...` cru:

  `AddressEmptyCode` · `AmountExceedsLot` · `AmountExceedsUint128` · `AmountQuantizedToZero` · `AssetNotAllowed` · `BaseNotCurated` · `BaseNotEnabled` · `CommitmentMismatch` · `ConfigEpochStale` · `CooldownActive` · `DecimalsOutOfRange` · `DeclaredBaseMismatch` · `ERC1967InvalidImplementation` · `ERC1967NonPayable` · `EscapeHatchIsNotAContract` · `ExecutorNotCurated` · `FailedCall` · `ForbiddenSpender` · `ForbiddenTarget` · `GrossBelowOperatorMin` · `GuardAlreadyAdded` · `GuardNotFound` · `GuardRejected` · `ImplementationNotAdoptable` · `InsufficientBalanceForFees` · `InsufficientGasForPlugin` · `InvalidInitialization` · `LotAssetMismatch` · `LotBaseMismatch` · `LotNotFound` · `LotNotOpen` · `NetBelowStrategyMin` · `NoPendingUpgrade` · `NotAContract` · `NotInitializing` · `NotOperator` · `NotOwner` · `NotPendingOwner` · `OwnerIsZero` · `Paused` · `ProposalExpired` · `RatioTooLow` · `Reentrancy` · `SafeERC20FailedOperation` · `StrategyCallFailed` · `TicketTooSmall` · `TooManyGuards` · `UpgradeExpired` · `UpgradeNotReady` · `ValidityTooLong`

---

## ProtocolRegistry

`0x7D1D8EacA0ce96cFAb5937b88Ba5d43d7e0Ad8dC`

### Escreve

| o que faz | assinatura para o seletor |
|---|---|
| `grantRole(bytes32 role, address account)` | `grantRole(bytes32,address)` |
| `renounceOperator()` | `renounceOperator()` |
| `renounceRole(bytes32 role, address callerConfirmation)` | `renounceRole(bytes32,address)` |
| `revokeRole(bytes32 role, address account)` | `revokeRole(bytes32,address)` |
| `setBaseCurrency(address token, bool enabled)` | `setBaseCurrency(address,bool)` |
| `setExecutor(address executor, bool enabled)` | `setExecutor(address,bool)` |
| `setFeeBps(uint16 newFeeBps)` | `setFeeBps(uint16)` |
| `setPaused(bool isPaused)` | `setPaused(bool)` |
| `setTreasury(address newTreasury)` | `setTreasury(address)` |

### Le

| o que faz | assinatura para o seletor |
|---|---|
| `DEFAULT_ADMIN_ROLE() -> bytes32` | `DEFAULT_ADMIN_ROLE()` |
| `FEE_BPS_MAX() -> uint16` | `FEE_BPS_MAX()` |
| `OPERATOR_ROLE() -> bytes32` | `OPERATOR_ROLE()` |
| `adminCount() -> uint256` | `adminCount()` |
| `execConfig(address caller) -> bytes32` | `execConfig(address)` |
| `feeBps() -> uint16` | `feeBps()` |
| `getRoleAdmin(bytes32 role) -> bytes32` | `getRoleAdmin(bytes32)` |
| `hasRole(bytes32 role, address account) -> bool` | `hasRole(bytes32,address)` |
| `isBaseCurrency(address token) -> bool` | `isBaseCurrency(address)` |
| `isExecutor(address who) -> bool` | `isExecutor(address)` |
| `isOperator(address who) -> bool` | `isOperator(address)` |
| `paused() -> bool` | `paused()` |
| `supportsInterface(bytes4 interfaceId) -> bool` | `supportsInterface(bytes4)` |
| `treasury() -> address` | `treasury()` |

### Eventos

- `BaseCurrencySet(address,bool)`
- `ExecutorSet(address,bool)`
- `FeeBpsSet(uint16)`
- `PausedSet(bool)`
- `RoleAdminChanged(bytes32,bytes32,bytes32)`
- `RoleGranted(bytes32,address,address)`
- `RoleRevoked(bytes32,address,address)`
- `TreasurySet(address)`

### Erros (8)

Custom errors. A tela deve decodificar em vez de mostrar `0x...` cru:

  `AccessControlBadConfirmation` · `AccessControlUnauthorizedAccount` · `AdminIsZero` · `ExecutorIsZero` · `FeeAboveCap` · `LastAdmin` · `TokenIsZero` · `TreasuryIsZero`

---

## ImplementationRegistry

`0x660ca39A7fbC39dFD0ab4403ff3812519Ed4c0B0`

### Escreve

| o que faz | assinatura para o seletor |
|---|---|
| `deprecate(address implementation)` | `deprecate(address)` |
| `grantRole(bytes32 role, address account)` | `grantRole(bytes32,address)` |
| `publish(address implementation)` | `publish(address)` |
| `renounceRole(bytes32 role, address callerConfirmation)` | `renounceRole(bytes32,address)` |
| `revokeRole(bytes32 role, address account)` | `revokeRole(bytes32,address)` |

### Le

| o que faz | assinatura para o seletor |
|---|---|
| `DEFAULT_ADMIN_ROLE() -> bytes32` | `DEFAULT_ADMIN_ROLE()` |
| `adminCount() -> uint256` | `adminCount()` |
| `getRoleAdmin(bytes32 role) -> bytes32` | `getRoleAdmin(bytes32)` |
| `hasRole(bytes32 role, address account) -> bool` | `hasRole(bytes32,address)` |
| `isAdoptable(address implementation) -> bool` | `isAdoptable(address)` |
| `statusOf(address implementation) -> uint8` | `statusOf(address)` |
| `supportsInterface(bytes4 interfaceId) -> bool` | `supportsInterface(bytes4)` |

### Eventos

- `ImplementationDeprecated(address)`
- `ImplementationPublished(address)`
- `RoleAdminChanged(bytes32,bytes32,bytes32)`
- `RoleGranted(bytes32,address,address)`
- `RoleRevoked(bytes32,address,address)`

### Erros (8)

Custom errors. A tela deve decodificar em vez de mostrar `0x...` cru:

  `AccessControlBadConfirmation` · `AccessControlUnauthorizedAccount` · `AdminIsZero` · `AlreadyDeprecated` · `AlreadyPublished` · `LastAdmin` · `NotAContract` · `NotPublished`

---

## Executor

`0x323C4192b269EA56aCd147dDbd3F71056E63E835`

### Escreve

| o que faz | assinatura para o seletor |
|---|---|
| `run(address target, address spender, address tokenIn, address tokenOut, uint256 amountIn, bytes data)` | `run(address,address,address,address,uint256,bytes)` |

### Erros (4)

Custom errors. A tela deve decodificar em vez de mostrar `0x...` cru:

  `AllowanceNotCleared` · `BalanceDeltaNonZero` · `Reentrancy` · `SafeERC20FailedOperation`

---

## EscapeHatch

`0x877c4BC26371bD835E48db6C2B11eB715333b490`

### Escreve

| o que faz | assinatura para o seletor |
|---|---|
| `withdraw(address token, uint256 amount, address to)` | `withdraw(address,uint256,address)` |

### Le

| o que faz | assinatura para o seletor |
|---|---|
| `owner() -> address` | `owner()` |

### Eventos

- `Withdrawn(address,address,uint256)`

### Erros (2)

Custom errors. A tela deve decodificar em vez de mostrar `0x...` cru:

  `NotOwner` · `SafeERC20FailedOperation`

---

## Structs

Quem monta a chamada precisa da ordem exata dos campos.

### ExecutedParams

| campo | tipo |
|---|---|
| `proposalHash` | `bytes32` |
| `nonce` | `uint64` |
| `side` | `uint8` |
| `asset` | `address` |
| `base` | `address` |
| `amountIn` | `uint256` |
| `gross` | `uint256` |
| `fee` | `uint256` |
| `refund` | `uint256` |
| `net` | `uint256` |
| `lotId` | `uint256` |
| `target` | `address` |

### ExecutionParams

| campo | tipo |
|---|---|
| `executor` | `address` |
| `target` | `address` |
| `spender` | `address` |
| `base` | `address` |
| `operatorMinOut` | `uint256` |
| `validUntil` | `uint64` |
| `declaredConfigEpoch` | `uint64` |
| `declaredRefund` | `uint256` |
| `declaredGas` | `uint256` |
| `declaredGasPrice` | `uint256` |
| `declaredQuote` | `uint256` |
| `candidateLotId` | `uint256` |
| `routeCalldata` | `bytes` |
| `executionHash` | `bytes32` |

### Intent

| campo | tipo |
|---|---|
| `side` | `uint8` |
| `asset` | `address` |
| `base` | `address` |
| `amountIn` | `uint256` |
| `minOut` | `uint256` |
| `lotId` | `uint256` |

### Lot

| campo | tipo |
|---|---|
| `asset` | `address` |
| `openedAt` | `uint48` |
| `base` | `address` |
| `remaining` | `uint128` |
| `allocatedCapital` | `uint128` |
