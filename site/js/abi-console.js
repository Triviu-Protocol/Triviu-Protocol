/* GERADO por scripts/gerar-abi-console.mjs — NAO EDITE A MAO.
 *
 * Cada assinatura e cada seletor aqui saiu de contracts/out/**, o artefato que o
 * forge produziu do codigo implantado. O keccak que calculou os seletores de erro
 * e os topicos de evento foi conferido, nesta mesma execucao, contra os
 * 26 seletores de funcao que o proprio forge escreveu.
 *
 * Editar este arquivo a mao reprova em scripts/check-console-abi.mjs.
 * Para atualizar:  forge build  &&  node scripts/gerar-abi-console.mjs
 */
(function (raiz) {
  "use strict";
  var ABI = {
  "conferidos": 26,
  "contratos": {
    "parameterRegistry": {
      "contrato": "ParameterRegistry",
      "funcoes": {
        "acceptOwner()": {
          "seletor": "0xebbc4965",
          "mutabilidade": "nonpayable",
          "entradas": [],
          "saidas": []
        },
        "defaultMinProfit()": {
          "seletor": "0xe27c8531",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint256"
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
        "isAllowedTarget(address)": {
          "seletor": "0x78addb48",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "",
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
        "isAllowedToken(address)": {
          "seletor": "0xcbe230c3",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "",
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
        "maxSlippageBps()": {
          "seletor": "0xc4aa7395",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint16"
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
        "setDefaultMinProfit(uint256,string)": {
          "seletor": "0x5d599f89",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "value",
              "tipo": "uint256"
            },
            {
              "nome": "prUrl",
              "tipo": "string"
            }
          ],
          "saidas": []
        },
        "setFeeBps(uint16,string)": {
          "seletor": "0x839fa2ef",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "bps",
              "tipo": "uint16"
            },
            {
              "nome": "prUrl",
              "tipo": "string"
            }
          ],
          "saidas": []
        },
        "setMaxSlippage(uint16,string)": {
          "seletor": "0xcbda58b3",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "bps",
              "tipo": "uint16"
            },
            {
              "nome": "prUrl",
              "tipo": "string"
            }
          ],
          "saidas": []
        },
        "setTarget(address,bool,string)": {
          "seletor": "0xb27e04e6",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "target",
              "tipo": "address"
            },
            {
              "nome": "allowed",
              "tipo": "bool"
            },
            {
              "nome": "prUrl",
              "tipo": "string"
            }
          ],
          "saidas": []
        },
        "setToken(address,bool,string)": {
          "seletor": "0x6933ec30",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "allowed",
              "tipo": "bool"
            },
            {
              "nome": "prUrl",
              "tipo": "string"
            }
          ],
          "saidas": []
        },
        "setTreasury(address,string)": {
          "seletor": "0x5208c662",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "newTreasury",
              "tipo": "address"
            },
            {
              "nome": "prUrl",
              "tipo": "string"
            }
          ],
          "saidas": []
        },
        "transferOwner(address)": {
          "seletor": "0x4fb2e45d",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "newOwner",
              "tipo": "address"
            }
          ],
          "saidas": []
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
        "0x7a9b272e": {
          "assinatura": "EmptyPrUrl()",
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
        "0xd92e233d": {
          "assinatura": "ZeroAddress()",
          "entradas": []
        }
      },
      "eventos": {
        "DefaultMinProfitSet(uint256,string)": {
          "topico": "0x2cad2928304fd111be4e70fd34b424a9ebbd3fe33ab44d8895796c5036fd6e09",
          "indexados": []
        },
        "FeeBpsSet(uint16,string)": {
          "topico": "0x02b73d84e86f420c41258653baadfb99a0064d85db2563de134437790c02cc1b",
          "indexados": []
        },
        "MaxSlippageSet(uint16,string)": {
          "topico": "0xa70675162e56068bd082e50713b974ef5959ed04c545626bb999ef656527979d",
          "indexados": []
        },
        "OwnerTransferred(address,address)": {
          "topico": "0x8934ce4adea8d9ce0d714d2c22b86790e41b7731c84b926fbbdc1d40ff6533c9",
          "indexados": [
            "previousOwner",
            "newOwner"
          ]
        },
        "OwnershipTransferStarted(address,address)": {
          "topico": "0x38d16b8cac22d99fc7c124b9cd0de2d3fa1faef420bfe791d8c362d765e22700",
          "indexados": [
            "previousOwner",
            "newOwner"
          ]
        },
        "TargetAllowed(address,bool,string)": {
          "topico": "0x1d1869d817ee81b1c4e14c37fd9694caa48efa77f52287bfd312a532d9059a63",
          "indexados": [
            "target"
          ]
        },
        "TokenAllowed(address,bool,string)": {
          "topico": "0x8801bbde469a15dc9d5db47df58a273ddb2ace1fded08564d83bc291511b3bd2",
          "indexados": [
            "token"
          ]
        },
        "TreasurySet(address,string)": {
          "topico": "0xce82e67618156a168fa7e190ff4cd085988c04be8f5e4aa5419e5f87edf10efb",
          "indexados": [
            "treasury"
          ]
        }
      }
    },
    "triviuExecutor": {
      "contrato": "TriviuExecutor",
      "funcoes": {
        "MAX_FEE_BPS()": {
          "seletor": "0xd55be8c6",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint16"
            }
          ]
        },
        "executeCycle(address,uint256,uint256,(uint8,address,address,address,uint24,uint256)[])": {
          "seletor": "0xd4379b1d",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "asset",
              "tipo": "address"
            },
            {
              "nome": "principal",
              "tipo": "uint256"
            },
            {
              "nome": "minProfit",
              "tipo": "uint256"
            },
            {
              "nome": "legs",
              "tipo": "(uint8,address,address,address,uint24,uint256)[]"
            }
          ],
          "saidas": []
        },
        "registry()": {
          "seletor": "0x7b103999",
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
        "0xe779b90b": {
          "assinatura": "BrokenChain(uint256)",
          "entradas": [
            {
              "nome": "index",
              "tipo": "uint256"
            }
          ]
        },
        "0xf0f367c9": {
          "assinatura": "CycleNotClosed(address,address,address)",
          "entradas": [
            {
              "nome": "open",
              "tipo": "address"
            },
            {
              "nome": "close",
              "tipo": "address"
            },
            {
              "nome": "asset",
              "tipo": "address"
            }
          ]
        },
        "0x9528138c": {
          "assinatura": "NoLegs()",
          "entradas": []
        },
        "0xab143c06": {
          "assinatura": "Reentrancy()",
          "entradas": []
        },
        "0xe356c1d3": {
          "assinatura": "TargetNotAllowed(address)",
          "entradas": [
            {
              "nome": "target",
              "tipo": "address"
            }
          ]
        },
        "0x94403b70": {
          "assinatura": "TokenNotAllowed(address)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            }
          ]
        },
        "0x39f1c8d9": {
          "assinatura": "TransferFailed(address)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            }
          ]
        },
        "0x7dc070a9": {
          "assinatura": "UnprofitableCycle(uint256,uint256)",
          "entradas": [
            {
              "nome": "realizedDelta",
              "tipo": "uint256"
            },
            {
              "nome": "required",
              "tipo": "uint256"
            }
          ]
        },
        "0x2cfac27c": {
          "assinatura": "ZeroPrincipal()",
          "entradas": []
        }
      },
      "eventos": {
        "CycleExecuted(address,address,uint256,uint256,uint256)": {
          "topico": "0x993fa1c8aa64702b86a9997108d4b9b49b0919a6878fc1bd9e9eb98406c9a048",
          "indexados": [
            "caller",
            "asset"
          ]
        }
      }
    },
    "gasTank": {
      "contrato": "GasTank",
      "funcoes": {
        "balanceOf(address)": {
          "seletor": "0x70a08231",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint256"
            }
          ]
        },
        "deposit()": {
          "seletor": "0xd0e30db0",
          "mutabilidade": "payable",
          "entradas": [],
          "saidas": []
        },
        "withdraw(uint256)": {
          "seletor": "0x2e1a7d4d",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "amount",
              "tipo": "uint256"
            }
          ],
          "saidas": []
        }
      },
      "erros": {
        "0xcf479181": {
          "assinatura": "InsufficientBalance(uint256,uint256)",
          "entradas": [
            {
              "nome": "requested",
              "tipo": "uint256"
            },
            {
              "nome": "available",
              "tipo": "uint256"
            }
          ]
        },
        "0x90b8ec18": {
          "assinatura": "TransferFailed()",
          "entradas": []
        }
      },
      "eventos": {
        "Deposited(address,uint256)": {
          "topico": "0x2da466a7b24304f47e87fa2e1e5a81b9831ce54fec19055ce277ca2f39ba42c4",
          "indexados": [
            "account"
          ]
        },
        "Withdrawn(address,uint256)": {
          "topico": "0x7084f5476618d8e60b11ef0d7d3f06914655adb8793e28ff7f018d4c76d505d5",
          "indexados": [
            "account"
          ]
        }
      }
    },
    "erc20": {
      "contrato": "IERC20",
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
              "nome": "amount",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bool"
            }
          ]
        },
        "balanceOf(address)": {
          "seletor": "0x70a08231",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint256"
            }
          ]
        },
        "transfer(address,uint256)": {
          "seletor": "0xa9059cbb",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "to",
              "tipo": "address"
            },
            {
              "nome": "amount",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bool"
            }
          ]
        },
        "transferFrom(address,address,uint256)": {
          "seletor": "0x23b872dd",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "from",
              "tipo": "address"
            },
            {
              "nome": "to",
              "tipo": "address"
            },
            {
              "nome": "amount",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "bool"
            }
          ]
        }
      },
      "erros": {},
      "eventos": {}
    }
  },
  "extras": {
    "erc20Meta": {
      "origem": "EIP-20 metadata (opcional na norma; ausente do IERC20 que o Executor declara)",
      "funcoes": {
        "symbol()": {
          "seletor": "0x95d89b41"
        },
        "decimals()": {
          "seletor": "0x313ce567"
        }
      }
    },
    "erc20Allowance": {
      "origem": "nucleo EIP-20 · ausente do IERC20 minimo deste repositorio · seletor conferido ao vivo contra 3 tokens liberados em 2026-08-12 (responderam 0, nao reverteram)",
      "funcoes": {
        "allowance(address,address)": {
          "seletor": "0xdd62ed3e"
        }
      }
    },
    "lpVault": {
      "origem": "sem fonte neste repositorio · assinatura medida ao vivo contra o contrato implantado em 2026-08-12",
      "funcoes": {
        "positionManager()": {
          "seletor": "0x791b98bc"
        }
      }
    },
    "solidity": {
      "origem": "reversoes embutidas no compilador Solidity · nao constam de nenhuma ABI",
      "funcoes": {
        "Error(string)": {
          "seletor": "0x08c379a0"
        },
        "Panic(uint256)": {
          "seletor": "0x4e487b71"
        }
      }
    }
  }
};
  if (typeof module !== "undefined" && module.exports) { module.exports = ABI; }
  if (raiz) { raiz.TRIVIU_ABI = ABI; }
})(typeof window !== "undefined" ? window : null);
