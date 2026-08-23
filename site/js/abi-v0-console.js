/* GERADO por scripts/gerar-abi-v0.mjs â€” NAO EDITE A MAO.
 *
 * Os ABIs da linha V0, no formato que site/js/motor.js consome em
 * sig(papel, assinatura). Cada seletor saiu do keccak-256 que
 * scripts/gerar-abi-console.mjs confere contra os seletores escritos pelo forge
 * antes de gerar qualquer coisa â€” nenhum hex foi digitado.
 *
 * Fonte: contracts/abi/*.json, que o CI mantem atual (job `contracts`, passo
 * "ABIs are current"). NAO e contracts/out/**: aquele traz a outra linha, e
 * `TriviuVault` existe nas duas com o mesmo nome e codigo diferente.
 *
 * Para atualizar:  sh contracts/script/abi.sh && node scripts/gerar-abi-v0.mjs
 */
(function (raiz) {
  "use strict";
  var ABI = {
  "gerado": "scripts/gerar-abi-v0.mjs",
  "linha": "V0",
  "contratos": {
    "factory": {
      "contrato": "VaultFactory",
      "funcoes": {
        "IMPLEMENTATION()": {
          "seletor": "0x3a4741bd",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "createVault(address,uint256)": {
          "seletor": "0x5f76dfc0",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "owner",
              "tipo": "address"
            },
            {
              "nome": "index",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "vault",
              "tipo": "address"
            }
          ]
        },
        "vaultAddress(address,uint256)": {
          "seletor": "0x3dbbed75",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "owner",
              "tipo": "address"
            },
            {
              "nome": "index",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        }
      },
      "erros": {
        "0x4ca249dc": {
          "assinatura": "Create2EmptyBytecode()",
          "entradas": []
        },
        "0xb06ebf3d": {
          "assinatura": "FailedDeployment()",
          "entradas": []
        },
        "0x6bfd14d6": {
          "assinatura": "ImplementationIsNotAContract()",
          "entradas": []
        },
        "0xcf479181": {
          "assinatura": "InsufficientBalance(uint256,uint256)",
          "entradas": [
            {
              "nome": "balance",
              "tipo": "uint256"
            },
            {
              "nome": "needed",
              "tipo": "uint256"
            }
          ]
        }
      },
      "eventos": {
        "VaultCreated(address,address,uint256)": {
          "topico": "0x0b045af6aff86dd2cda5342fd0329a354dc66759ff1eda00d7ecf13a76c7fb3b",
          "indexados": [
            "vault",
            "owner",
            "index"
          ]
        }
      }
    },
    "vault": {
      "contrato": "TriviuVault",
      "funcoes": {
        "ESCAPE_HATCH()": {
          "seletor": "0xe556f02d",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "IMPL_REGISTRY()": {
          "seletor": "0x0b701dd9",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "REGISTRY()": {
          "seletor": "0x06433b1b",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "acceptOwnership()": {
          "seletor": "0x79ba5097",
          "mutabilidade": "nonpayable",
          "entradas": [],
          "saidas": []
        },
        "addGuard(address)": {
          "seletor": "0x6913a63c",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "guard",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "adoptEscapeHatch()": {
          "seletor": "0xa45dc6dd",
          "mutabilidade": "nonpayable",
          "entradas": [],
          "saidas": []
        },
        "assetDecimals(address)": {
          "seletor": "0xe366da2c",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "asset",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint8"
            }
          ]
        },
        "backing(uint256)": {
          "seletor": "0x14e9fb01",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "lotId",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint256"
            }
          ]
        },
        "baseCurrencyDecimals(address)": {
          "seletor": "0xc778f5f5",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint8"
            }
          ]
        },
        "cancelUpgrade()": {
          "seletor": "0x55f29166",
          "mutabilidade": "nonpayable",
          "entradas": [],
          "saidas": []
        },
        "configEpoch()": {
          "seletor": "0x32322970",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint64"
            }
          ]
        },
        "deposit(address,uint256)": {
          "seletor": "0x47e7ef24",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "amount",
              "tipo": "uint256"
            }
          ],
          "saidas": []
        },
        "dryRunChecks(uint256,address)": {
          "seletor": "0x66e59375",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "candidateLotId",
              "tipo": "uint256"
            },
            {
              "nome": "base",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "(uint8,address,address,uint256,uint256,uint256)"
            }
          ]
        },
        "execute((address,address,address,address,uint256,uint64,uint64,uint256,uint256,uint256,uint256,uint256,bytes,bytes32))": {
          "seletor": "0x5bb12a1c",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "p",
              "tipo": "(address,address,address,address,uint256,uint64,uint64,uint256,uint256,uint256,uint256,uint256,bytes,bytes32)"
            }
          ],
          "saidas": []
        },
        "executeAsOwner((uint8,address,address,uint256,uint256,uint256),(address,address,address,address,uint256,uint64,uint64,uint256,uint256,uint256,uint256,uint256,bytes,bytes32))": {
          "seletor": "0x2475b08e",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "intent",
              "tipo": "(uint8,address,address,uint256,uint256,uint256)"
            },
            {
              "nome": "p",
              "tipo": "(address,address,address,address,uint256,uint64,uint64,uint256,uint256,uint256,uint256,uint256,bytes,bytes32)"
            }
          ],
          "saidas": []
        },
        "executeUpgrade()": {
          "seletor": "0x7e896214",
          "mutabilidade": "nonpayable",
          "entradas": [],
          "saidas": []
        },
        "guards()": {
          "seletor": "0x448788ef",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address[]"
            }
          ]
        },
        "initialize(address)": {
          "seletor": "0xc4d66de8",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "newOwner",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "interfaceVersion()": {
          "seletor": "0x1d8ffa4d",
          "mutabilidade": "pure",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint16"
            }
          ]
        },
        "lastExecAt()": {
          "seletor": "0x3a929949",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint64"
            }
          ]
        },
        "limits()": {
          "seletor": "0x860aefcf",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "bytes32"
            }
          ]
        },
        "lot(uint256)": {
          "seletor": "0x14ac5ff2",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "lotId",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "(address,uint48,address,uint128,uint128)"
            }
          ]
        },
        "lotCount()": {
          "seletor": "0x7ae169e9",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint256"
            }
          ]
        },
        "nonce()": {
          "seletor": "0xaffed0e0",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint64"
            }
          ]
        },
        "owner()": {
          "seletor": "0x8da5cb5b",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "pendingOwner()": {
          "seletor": "0xe30c3978",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "pendingUpgrade()": {
          "seletor": "0x95e93245",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "implementation",
              "tipo": "address"
            },
            {
              "nome": "eta",
              "tipo": "uint64"
            }
          ]
        },
        "proposeUpgrade(address)": {
          "seletor": "0xc915fc93",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "implementation",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "removeGuard(address)": {
          "seletor": "0xb6235016",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "guard",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "setAllowedAsset(address,bool)": {
          "seletor": "0xd9a3aa3c",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "asset",
              "tipo": "address"
            },
            {
              "nome": "allowed",
              "tipo": "bool"
            }
          ],
          "saidas": []
        },
        "setBaseCurrency(address,bool)": {
          "seletor": "0xa77b4d8b",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "enabled",
              "tipo": "bool"
            }
          ],
          "saidas": []
        },
        "setLimits(uint64,uint64,uint16,uint112)": {
          "seletor": "0xdabe80bc",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "cooldown",
              "tipo": "uint64"
            },
            {
              "nome": "maxValidity",
              "tipo": "uint64"
            },
            {
              "nome": "minRatioBps",
              "tipo": "uint16"
            },
            {
              "nome": "quantum",
              "tipo": "uint112"
            }
          ],
          "saidas": []
        },
        "setStrategy(address)": {
          "seletor": "0x33a100ca",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "newStrategy",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "strategy()": {
          "seletor": "0xa8c62e76",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "transferOwnership(address)": {
          "seletor": "0xf2fde38b",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "newOwner",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "withdraw(address,uint256,address)": {
          "seletor": "0x69328dec",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "amount",
              "tipo": "uint256"
            },
            {
              "nome": "to",
              "tipo": "address"
            }
          ],
          "saidas": []
        }
      },
      "erros": {
        "0x9996b315": {
          "assinatura": "AddressEmptyCode(address)",
          "entradas": [
            {
              "nome": "target",
              "tipo": "address"
            }
          ]
        },
        "0x33d10af4": {
          "assinatura": "AmountExceedsLot(uint256,uint256,uint256)",
          "entradas": [
            {
              "nome": "lotId",
              "tipo": "uint256"
            },
            {
              "nome": "amount",
              "tipo": "uint256"
            },
            {
              "nome": "remaining",
              "tipo": "uint256"
            }
          ]
        },
        "0x7a44b3a6": {
          "assinatura": "AmountExceedsUint128(uint256)",
          "entradas": [
            {
              "nome": "value",
              "tipo": "uint256"
            }
          ]
        },
        "0x780942a0": {
          "assinatura": "AmountQuantizedToZero()",
          "entradas": []
        },
        "0x48472343": {
          "assinatura": "AssetNotAllowed()",
          "entradas": []
        },
        "0x59938b38": {
          "assinatura": "BaseNotCurated()",
          "entradas": []
        },
        "0x26f846df": {
          "assinatura": "BaseNotEnabled()",
          "entradas": []
        },
        "0x5054097b": {
          "assinatura": "CommitmentMismatch()",
          "entradas": []
        },
        "0xc2722c41": {
          "assinatura": "ConfigEpochStale()",
          "entradas": []
        },
        "0xaa9a98df": {
          "assinatura": "CooldownActive()",
          "entradas": []
        },
        "0xf6f3acb9": {
          "assinatura": "DecimalsOutOfRange(uint8)",
          "entradas": [
            {
              "nome": "decimals",
              "tipo": "uint8"
            }
          ]
        },
        "0x89539ee0": {
          "assinatura": "DeclaredBaseMismatch()",
          "entradas": []
        },
        "0x4c9c8ce3": {
          "assinatura": "ERC1967InvalidImplementation(address)",
          "entradas": [
            {
              "nome": "implementation",
              "tipo": "address"
            }
          ]
        },
        "0xb398979f": {
          "assinatura": "ERC1967NonPayable()",
          "entradas": []
        },
        "0xf0f24336": {
          "assinatura": "EscapeHatchIsNotAContract()",
          "entradas": []
        },
        "0x739c8c2f": {
          "assinatura": "ExecutorNotCurated()",
          "entradas": []
        },
        "0xd6bda275": {
          "assinatura": "FailedCall()",
          "entradas": []
        },
        "0xe21ca416": {
          "assinatura": "ForbiddenSpender()",
          "entradas": []
        },
        "0xe813ba38": {
          "assinatura": "ForbiddenTarget()",
          "entradas": []
        },
        "0x7b3f2d8a": {
          "assinatura": "GrossBelowOperatorMin()",
          "entradas": []
        },
        "0x62ea3d33": {
          "assinatura": "GuardAlreadyAdded(address)",
          "entradas": [
            {
              "nome": "guard",
              "tipo": "address"
            }
          ]
        },
        "0x4c166cea": {
          "assinatura": "GuardNotFound(address)",
          "entradas": [
            {
              "nome": "guard",
              "tipo": "address"
            }
          ]
        },
        "0x9ad0011f": {
          "assinatura": "GuardRejected(address,bytes)",
          "entradas": [
            {
              "nome": "guard",
              "tipo": "address"
            },
            {
              "nome": "reason",
              "tipo": "bytes"
            }
          ]
        },
        "0xf827cb9f": {
          "assinatura": "ImplementationNotAdoptable(address)",
          "entradas": [
            {
              "nome": "implementation",
              "tipo": "address"
            }
          ]
        },
        "0x8adc4ac2": {
          "assinatura": "InsufficientBalanceForFees()",
          "entradas": []
        },
        "0x532e2963": {
          "assinatura": "InsufficientGasForPlugin()",
          "entradas": []
        },
        "0xf92ee8a9": {
          "assinatura": "InvalidInitialization()",
          "entradas": []
        },
        "0x6adad3d1": {
          "assinatura": "LotAssetMismatch(uint256,address,address)",
          "entradas": [
            {
              "nome": "lotId",
              "tipo": "uint256"
            },
            {
              "nome": "lotAsset",
              "tipo": "address"
            },
            {
              "nome": "intentAsset",
              "tipo": "address"
            }
          ]
        },
        "0x2cff0680": {
          "assinatura": "LotBaseMismatch(uint256,address,address)",
          "entradas": [
            {
              "nome": "lotId",
              "tipo": "uint256"
            },
            {
              "nome": "lotBase",
              "tipo": "address"
            },
            {
              "nome": "declaredBase",
              "tipo": "address"
            }
          ]
        },
        "0x76aca2bd": {
          "assinatura": "LotNotFound(uint256)",
          "entradas": [
            {
              "nome": "lotId",
              "tipo": "uint256"
            }
          ]
        },
        "0x27555084": {
          "assinatura": "LotNotOpen(uint256)",
          "entradas": [
            {
              "nome": "lotId",
              "tipo": "uint256"
            }
          ]
        },
        "0x1d405fef": {
          "assinatura": "NetBelowStrategyMin()",
          "entradas": []
        },
        "0xdd61275e": {
          "assinatura": "NoPendingUpgrade()",
          "entradas": []
        },
        "0x8a8b41ec": {
          "assinatura": "NotAContract(address)",
          "entradas": [
            {
              "nome": "target",
              "tipo": "address"
            }
          ]
        },
        "0xd7e6bcf8": {
          "assinatura": "NotInitializing()",
          "entradas": []
        },
        "0x7c214f04": {
          "assinatura": "NotOperator()",
          "entradas": []
        },
        "0x30cd7471": {
          "assinatura": "NotOwner()",
          "entradas": []
        },
        "0x1853971c": {
          "assinatura": "NotPendingOwner()",
          "entradas": []
        },
        "0x4269a059": {
          "assinatura": "OwnerIsZero()",
          "entradas": []
        },
        "0x9e87fac8": {
          "assinatura": "Paused()",
          "entradas": []
        },
        "0x28a72379": {
          "assinatura": "ProposalExpired()",
          "entradas": []
        },
        "0x2484c548": {
          "assinatura": "RatioTooLow()",
          "entradas": []
        },
        "0xab143c06": {
          "assinatura": "Reentrancy()",
          "entradas": []
        },
        "0x5274afe7": {
          "assinatura": "SafeERC20FailedOperation(address)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            }
          ]
        },
        "0x59bf6600": {
          "assinatura": "StrategyCallFailed()",
          "entradas": []
        },
        "0x36c477f7": {
          "assinatura": "TicketTooSmall()",
          "entradas": []
        },
        "0xcd084cff": {
          "assinatura": "TooManyGuards()",
          "entradas": []
        },
        "0x101d4221": {
          "assinatura": "UpgradeExpired(uint64)",
          "entradas": [
            {
              "nome": "deadline",
              "tipo": "uint64"
            }
          ]
        },
        "0x5ceb28a7": {
          "assinatura": "UpgradeNotReady(uint64)",
          "entradas": [
            {
              "nome": "eta",
              "tipo": "uint64"
            }
          ]
        },
        "0xdec1583f": {
          "assinatura": "ValidityTooLong()",
          "entradas": []
        }
      },
      "eventos": {
        "AssetSet(address,uint8,uint64)": {
          "topico": "0x3671dd08c2ba176809c5e862ffbb1f354ab1baa05bebba3f910b4e0ef0a0a58b",
          "indexados": [
            "asset"
          ]
        },
        "BaseCurrencySet(address,uint8,uint64)": {
          "topico": "0xf8e41a6313f4c62808b8d12cb9b34229602b446590412bcb24c0b1fba85f9f45",
          "indexados": [
            "token"
          ]
        },
        "Deposited(address,address,uint256)": {
          "topico": "0x8752a472e571a816aea92eec8dae9baf628e840f4929fbcc2d155e6233ff68a7",
          "indexados": [
            "token",
            "from"
          ]
        },
        "EscapeHatchAdopted(address)": {
          "topico": "0xe2193b89dc994b623a0cbee696321c4ec5a7b2b8473fbe0313986181f3dfd4d9",
          "indexados": [
            "escapeHatch"
          ]
        },
        "Executed((bytes32,uint64,uint8,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address))": {
          "topico": "0x28028de4eafce51085be5efcb42952200fe26e7c4295d5d5e8d7eaf518a306bd",
          "indexados": []
        },
        "GuardAdded(address,uint64)": {
          "topico": "0xdf916b55b38a5c1cb63841201f68bb1b22c1519e0229b39add63288710ea2513",
          "indexados": [
            "guard"
          ]
        },
        "GuardRemoved(address,uint64)": {
          "topico": "0x2d865d6ac529751f487979ebaeecfb22c107bcc923e1a0f2af40e2a11a930749",
          "indexados": [
            "guard"
          ]
        },
        "Initialized(uint64)": {
          "topico": "0xc7f505b2f371ae2175ee4913f4499e1f2633a7b5936321eed1cdaeb6115181d2",
          "indexados": []
        },
        "LimitsSet(bytes32,uint64)": {
          "topico": "0xe67e0dd380059a73e92d9b1a19978f25d7ca01a85cea3c8f9f092af0ae8bb25f",
          "indexados": []
        },
        "LotClosed(uint256,address,address,uint256,uint256,uint256,bool)": {
          "topico": "0x499210c6c3da7c13a50dc0538186190437a66a52240782da9c75f107c551eff4",
          "indexados": [
            "lotId",
            "asset",
            "base"
          ]
        },
        "LotOpened(uint256,address,address,uint256,uint256,uint48)": {
          "topico": "0xf5bcf6e80686110e0e87d7b7e0beb05259ec8336a532e1944a6f9f71a21d326b",
          "indexados": [
            "lotId",
            "asset",
            "base"
          ]
        },
        "OwnershipTransferStarted(address,address)": {
          "topico": "0x38d16b8cac22d99fc7c124b9cd0de2d3fa1faef420bfe791d8c362d765e22700",
          "indexados": [
            "currentOwner",
            "newOwner"
          ]
        },
        "OwnershipTransferred(address,address)": {
          "topico": "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0",
          "indexados": [
            "previousOwner",
            "newOwner"
          ]
        },
        "RefundDetail(uint256,uint256,uint256,uint256,uint256)": {
          "topico": "0x38c054723448267a996490c302701a17f51599be7f8ad4cffe45ee5c9ef78952",
          "indexados": []
        },
        "StrategySet(address,uint64)": {
          "topico": "0xae56fa1cbfdb11fbbeb9e163b58842204c98ed0997c8c892c1d22099a4c48966",
          "indexados": [
            "strategy"
          ]
        },
        "UpgradeCancelled(address)": {
          "topico": "0x3198dc80249fcfedbd0d06e1ff49a7695a51b006592328ce0b127cdeab77e936",
          "indexados": [
            "implementation"
          ]
        },
        "UpgradeExecuted(address,uint64)": {
          "topico": "0xc1cea00c44b6c874e3eb1dcb76a6133b680464c8cbdfd09d3db5f6b3e1e35366",
          "indexados": [
            "implementation"
          ]
        },
        "UpgradeProposed(address,uint64)": {
          "topico": "0xf7f785105b8c71eb1f84c2b517becaac3aebfff4cb18904a739305118e9aecae",
          "indexados": [
            "implementation"
          ]
        },
        "Upgraded(address)": {
          "topico": "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b",
          "indexados": [
            "implementation"
          ]
        },
        "Withdrawn(address,address,uint256)": {
          "topico": "0xd1c19fbcd4551a5edfb66d43d2e337c04837afda3482b42bdf569a8fccdae5fb",
          "indexados": [
            "token",
            "to"
          ]
        }
      }
    },
    "protocolRegistry": {
      "contrato": "ProtocolRegistry",
      "funcoes": {
        "DEFAULT_ADMIN_ROLE()": {
          "seletor": "0xa217fddf",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "bytes32"
            }
          ]
        },
        "FEE_BPS_MAX()": {
          "seletor": "0x93a026b3",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint16"
            }
          ]
        },
        "OPERATOR_ROLE()": {
          "seletor": "0xf5b541a6",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "bytes32"
            }
          ]
        },
        "adminCount()": {
          "seletor": "0x2b7832b3",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint256"
            }
          ]
        },
        "execConfig(address)": {
          "seletor": "0x02c67c03",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "caller",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bytes32"
            }
          ]
        },
        "feeBps()": {
          "seletor": "0x24a9d853",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint16"
            }
          ]
        },
        "getRoleAdmin(bytes32)": {
          "seletor": "0x248a9ca3",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "role",
              "tipo": "bytes32"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bytes32"
            }
          ]
        },
        "grantRole(bytes32,address)": {
          "seletor": "0x2f2ff15d",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "role",
              "tipo": "bytes32"
            },
            {
              "nome": "account",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "hasRole(bytes32,address)": {
          "seletor": "0x91d14854",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "role",
              "tipo": "bytes32"
            },
            {
              "nome": "account",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bool"
            }
          ]
        },
        "isBaseCurrency(address)": {
          "seletor": "0x9b8bf37d",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bool"
            }
          ]
        },
        "isExecutor(address)": {
          "seletor": "0xdebfda30",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "who",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bool"
            }
          ]
        },
        "isOperator(address)": {
          "seletor": "0x6d70f7ae",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "who",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bool"
            }
          ]
        },
        "paused()": {
          "seletor": "0x5c975abb",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "bool"
            }
          ]
        },
        "renounceOperator()": {
          "seletor": "0x2ab6f8db",
          "mutabilidade": "nonpayable",
          "entradas": [],
          "saidas": []
        },
        "renounceRole(bytes32,address)": {
          "seletor": "0x36568abe",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "role",
              "tipo": "bytes32"
            },
            {
              "nome": "callerConfirmation",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "revokeRole(bytes32,address)": {
          "seletor": "0xd547741f",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "role",
              "tipo": "bytes32"
            },
            {
              "nome": "account",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "setBaseCurrency(address,bool)": {
          "seletor": "0xa77b4d8b",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "enabled",
              "tipo": "bool"
            }
          ],
          "saidas": []
        },
        "setExecutor(address,bool)": {
          "seletor": "0x1e1bff3f",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "executor",
              "tipo": "address"
            },
            {
              "nome": "enabled",
              "tipo": "bool"
            }
          ],
          "saidas": []
        },
        "setFeeBps(uint16)": {
          "seletor": "0x023b1fc9",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "newFeeBps",
              "tipo": "uint16"
            }
          ],
          "saidas": []
        },
        "setPaused(bool)": {
          "seletor": "0x16c38b3c",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "isPaused",
              "tipo": "bool"
            }
          ],
          "saidas": []
        },
        "setTreasury(address)": {
          "seletor": "0xf0f44260",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "newTreasury",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "supportsInterface(bytes4)": {
          "seletor": "0x01ffc9a7",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "interfaceId",
              "tipo": "bytes4"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bool"
            }
          ]
        },
        "treasury()": {
          "seletor": "0x61d027b3",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        }
      },
      "erros": {
        "0x6697b232": {
          "assinatura": "AccessControlBadConfirmation()",
          "entradas": []
        },
        "0xe2517d3f": {
          "assinatura": "AccessControlUnauthorizedAccount(address,bytes32)",
          "entradas": [
            {
              "nome": "account",
              "tipo": "address"
            },
            {
              "nome": "neededRole",
              "tipo": "bytes32"
            }
          ]
        },
        "0x1db8ca03": {
          "assinatura": "AdminIsZero()",
          "entradas": []
        },
        "0xd0f5f9dc": {
          "assinatura": "ExecutorIsZero()",
          "entradas": []
        },
        "0x5ccbf4a5": {
          "assinatura": "FeeAboveCap(uint16,uint16)",
          "entradas": [
            {
              "nome": "requested",
              "tipo": "uint16"
            },
            {
              "nome": "cap",
              "tipo": "uint16"
            }
          ]
        },
        "0xdf0e465e": {
          "assinatura": "LastAdmin()",
          "entradas": []
        },
        "0x761ded35": {
          "assinatura": "TokenIsZero()",
          "entradas": []
        },
        "0x792ccbf6": {
          "assinatura": "TreasuryIsZero()",
          "entradas": []
        }
      },
      "eventos": {
        "BaseCurrencySet(address,bool)": {
          "topico": "0xe3d40e6e78d5bec06b91b2b84856124c31e049837eed210cc916aafd4cf48685",
          "indexados": [
            "token"
          ]
        },
        "ExecutorSet(address,bool)": {
          "topico": "0x278b09622564dd3991fe7744514513d64ea2c8ed2b2b9ec1150ad964fde80a99",
          "indexados": [
            "executor"
          ]
        },
        "FeeBpsSet(uint16)": {
          "topico": "0x9bcf94806ecd549c5fde16e51a1aa08969f40766e486082ffa0776f594ceeba0",
          "indexados": []
        },
        "PausedSet(bool)": {
          "topico": "0x40db37ff5c0bdc2c427fbb2078c8f24afea940abac0e3c23bb4ea3bf2da2b212",
          "indexados": []
        },
        "RoleAdminChanged(bytes32,bytes32,bytes32)": {
          "topico": "0xbd79b86ffe0ab8e8776151514217cd7cacd52c909f66475c3af44e129f0b00ff",
          "indexados": [
            "role",
            "previousAdminRole",
            "newAdminRole"
          ]
        },
        "RoleGranted(bytes32,address,address)": {
          "topico": "0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d",
          "indexados": [
            "role",
            "account",
            "sender"
          ]
        },
        "RoleRevoked(bytes32,address,address)": {
          "topico": "0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b",
          "indexados": [
            "role",
            "account",
            "sender"
          ]
        },
        "TreasurySet(address)": {
          "topico": "0x3c864541ef71378c6229510ed90f376565ee42d9c5e0904a984a9e863e6db44f",
          "indexados": [
            "treasury"
          ]
        }
      }
    },
    "escapeHatch": {
      "contrato": "EscapeHatch",
      "funcoes": {
        "owner()": {
          "seletor": "0x8da5cb5b",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "withdraw(address,uint256,address)": {
          "seletor": "0x69328dec",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "amount",
              "tipo": "uint256"
            },
            {
              "nome": "to",
              "tipo": "address"
            }
          ],
          "saidas": []
        }
      },
      "erros": {
        "0x30cd7471": {
          "assinatura": "NotOwner()",
          "entradas": []
        },
        "0x5274afe7": {
          "assinatura": "SafeERC20FailedOperation(address)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            }
          ]
        }
      },
      "eventos": {
        "Withdrawn(address,address,uint256)": {
          "topico": "0xd1c19fbcd4551a5edfb66d43d2e337c04837afda3482b42bdf569a8fccdae5fb",
          "indexados": [
            "token",
            "to"
          ]
        }
      }
    }
  },
  "extras": {
    "erc20": {
      "origem": "EIP-20 · sem artefato nesta arvore; seletor pelo keccak conferido, nunca digitado",
      "funcoes": {
        "approve(address,uint256)": {
          "seletor": "0x095ea7b3",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "spender",
              "tipo": "address"
            },
            {
              "nome": "value",
              "tipo": "uint256"
            }
          ],
          "saidas": []
        },
        "balanceOf(address)": {
          "seletor": "0x70a08231",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "owner",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "allowance(address,address)": {
          "seletor": "0xdd62ed3e",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "owner",
              "tipo": "address"
            },
            {
              "nome": "spender",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "decimals()": {
          "seletor": "0x313ce567",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": []
        },
        "symbol()": {
          "seletor": "0x95d89b41",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": []
        }
      }
    }
  }
};
  if (typeof module !== "undefined" && module.exports) { module.exports = ABI; }
  if (raiz) { raiz.TRIVIU_ABI_V0 = ABI; }
})(typeof window !== "undefined" ? window : null);
