/* GERADO por scripts/gerar-abi-console.mjs — NAO EDITE A MAO.
 *
 * Cada assinatura e cada seletor aqui saiu de contracts/out/**, o artefato que o
 * forge produziu do codigo implantado. O keccak que calculou os seletores de erro
 * e os topicos de evento foi conferido, nesta mesma execucao, contra os
 * 64 seletores de funcao que o proprio forge escreveu.
 *
 * Editar este arquivo a mao reprova em scripts/check-console-abi.mjs.
 * Para atualizar:  forge build  &&  node scripts/gerar-abi-console.mjs
 */
(function (raiz) {
  "use strict";
  var ABI = {
  "conferidos": 64,
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
    },
    "lpVault": {
      "contrato": "TriviuLPVault",
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
        "abrir((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,uint256))": {
          "seletor": "0x9016af16",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "p",
              "tipo": "(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,uint256)"
            }
          ],
          "saidas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            },
            {
              "nome": "liquidez",
              "tipo": "uint128"
            },
            {
              "nome": "usado0",
              "tipo": "uint256"
            },
            {
              "nome": "usado1",
              "tipo": "uint256"
            }
          ]
        },
        "coletar(uint256,uint16,uint256)": {
          "seletor": "0x622b9ed4",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            },
            {
              "nome": "feeBpsMax",
              "tipo": "uint16"
            },
            {
              "nome": "prazo",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "aoDono0",
              "tipo": "uint256"
            },
            {
              "nome": "aoDono1",
              "tipo": "uint256"
            }
          ]
        },
        "fechar(uint256,uint256,uint256,uint256,uint16)": {
          "seletor": "0x9fb13583",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            },
            {
              "nome": "amount0Min",
              "tipo": "uint256"
            },
            {
              "nome": "amount1Min",
              "tipo": "uint256"
            },
            {
              "nome": "prazo",
              "tipo": "uint256"
            },
            {
              "nome": "feeBpsMax",
              "tipo": "uint16"
            }
          ],
          "saidas": [
            {
              "nome": "aoDono0",
              "tipo": "uint256"
            },
            {
              "nome": "aoDono1",
              "tipo": "uint256"
            }
          ]
        },
        "posicaoDe(uint256)": {
          "seletor": "0x0960103b",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "dep0",
              "tipo": "uint128"
            },
            {
              "nome": "dep1",
              "tipo": "uint128"
            },
            {
              "nome": "coletado0",
              "tipo": "uint128"
            },
            {
              "nome": "coletado1",
              "tipo": "uint128"
            }
          ]
        },
        "positionManager()": {
          "seletor": "0x791b98bc",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
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
        "0x311dc2c1": {
          "assinatura": "AprovacaoAmpla(uint256)",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            }
          ]
        },
        "0xbd36b870": {
          "assinatura": "AprovacaoAusente(uint256)",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            }
          ]
        },
        "0x8e525175": {
          "assinatura": "AprovacaoRecusada(address,address,uint256)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "gastador",
              "tipo": "address"
            },
            {
              "nome": "quantia",
              "tipo": "uint256"
            }
          ]
        },
        "0xb2e9a9bf": {
          "assinatura": "EnderecoZerado()",
          "entradas": []
        },
        "0x7bbfbe73": {
          "assinatura": "NadaAColetar(uint256)",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            }
          ]
        },
        "0x02edf030": {
          "assinatura": "NaoEDono(uint256,address,address)",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            },
            {
              "nome": "dono",
              "tipo": "address"
            },
            {
              "nome": "quemChamou",
              "tipo": "address"
            }
          ]
        },
        "0x9847caa7": {
          "assinatura": "PrazoExpirado()",
          "entradas": []
        },
        "0x63d237cb": {
          "assinatura": "Reentrante()",
          "entradas": []
        },
        "0x57ca6d44": {
          "assinatura": "SemLiquidez(uint256)",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            }
          ]
        },
        "0x5a1474a1": {
          "assinatura": "SobraNaoDevolvida(address,uint256)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "quantia",
              "tipo": "uint256"
            }
          ]
        },
        "0x3506aa16": {
          "assinatura": "TaxaAcimaDoLimite(uint16,uint16)",
          "entradas": [
            {
              "nome": "limite",
              "tipo": "uint16"
            },
            {
              "nome": "vigente",
              "tipo": "uint16"
            }
          ]
        },
        "0x9d5ba1a9": {
          "assinatura": "TesourariaZerada()",
          "entradas": []
        },
        "0xa7d11b56": {
          "assinatura": "TokenNaoPermitido(address)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            }
          ]
        },
        "0x381d5008": {
          "assinatura": "TransferenciaFalhou(address,address,uint256)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "para",
              "tipo": "address"
            },
            {
              "nome": "quantia",
              "tipo": "uint256"
            }
          ]
        }
      },
      "eventos": {
        "PosicaoAberta(uint256,address,address,address,uint24,uint128,uint256,uint256)": {
          "topico": "0x399ddbf14763b65da28fd405a39f7b6fb4bc0e8846ad5192011cd688bdf600fb",
          "indexados": [
            "tokenId",
            "dono"
          ]
        },
        "PosicaoFechada(uint256,address,uint256,uint256,uint256,uint256,uint256,uint256,uint16)": {
          "topico": "0x6c63b9f53dbbefdc06f22120c03811a834a35cd2c0beb86c4e302d66abb0b947",
          "indexados": [
            "tokenId",
            "dono"
          ]
        },
        "TaxasColetadas(uint256,address,uint256,uint256,uint256,uint256,uint16)": {
          "topico": "0xf118066f03b78daf4ba68576ba0fd20f0c3525289bc99b424a49345fcea996ea",
          "indexados": [
            "tokenId",
            "dono"
          ]
        }
      }
    },
    "npm": {
      "contrato": "INonfungiblePositionManager",
      "funcoes": {
        "burn(uint256)": {
          "seletor": "0x42966c68",
          "mutabilidade": "payable",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            }
          ],
          "saidas": []
        },
        "collect((uint256,address,uint128,uint128))": {
          "seletor": "0xfc6f7865",
          "mutabilidade": "payable",
          "entradas": [
            {
              "nome": "params",
              "tipo": "(uint256,address,uint128,uint128)"
            }
          ],
          "saidas": [
            {
              "nome": "amount0",
              "tipo": "uint256"
            },
            {
              "nome": "amount1",
              "tipo": "uint256"
            }
          ]
        },
        "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))": {
          "seletor": "0x0c49ccbe",
          "mutabilidade": "payable",
          "entradas": [
            {
              "nome": "params",
              "tipo": "(uint256,uint128,uint256,uint256,uint256)"
            }
          ],
          "saidas": [
            {
              "nome": "amount0",
              "tipo": "uint256"
            },
            {
              "nome": "amount1",
              "tipo": "uint256"
            }
          ]
        },
        "getApproved(uint256)": {
          "seletor": "0x081812fc",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))": {
          "seletor": "0x88316456",
          "mutabilidade": "payable",
          "entradas": [
            {
              "nome": "params",
              "tipo": "(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"
            }
          ],
          "saidas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            },
            {
              "nome": "liquidity",
              "tipo": "uint128"
            },
            {
              "nome": "amount0",
              "tipo": "uint256"
            },
            {
              "nome": "amount1",
              "tipo": "uint256"
            }
          ]
        },
        "ownerOf(uint256)": {
          "seletor": "0x6352211e",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "positions(uint256)": {
          "seletor": "0x99fbab88",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "tokenId",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "nonce",
              "tipo": "uint96"
            },
            {
              "nome": "operator",
              "tipo": "address"
            },
            {
              "nome": "token0",
              "tipo": "address"
            },
            {
              "nome": "token1",
              "tipo": "address"
            },
            {
              "nome": "fee",
              "tipo": "uint24"
            },
            {
              "nome": "tickLower",
              "tipo": "int24"
            },
            {
              "nome": "tickUpper",
              "tipo": "int24"
            },
            {
              "nome": "liquidity",
              "tipo": "uint128"
            },
            {
              "nome": "feeGrowthInside0LastX128",
              "tipo": "uint256"
            },
            {
              "nome": "feeGrowthInside1LastX128",
              "tipo": "uint256"
            },
            {
              "nome": "tokensOwed0",
              "tipo": "uint128"
            },
            {
              "nome": "tokensOwed1",
              "tipo": "uint128"
            }
          ]
        }
      },
      "erros": {},
      "eventos": {}
    },
    "triviuRegistry": {
      "contrato": "TriviuRegistry",
      "funcoes": {
        "cercaDe(address,address)": {
          "seletor": "0x6706c1c6",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "",
              "tipo": "address"
            },
            {
              "nome": "",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "cofreDe(address,address)": {
          "seletor": "0xdd18da07",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "",
              "tipo": "address"
            },
            {
              "nome": "",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "cofres(uint256)": {
          "seletor": "0x5aad4e52",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "",
              "tipo": "uint256"
            }
          ],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "contas(address)": {
          "seletor": "0xe46de4ce",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "registrado",
              "tipo": "bool"
            },
            {
              "nome": "desde",
              "tipo": "uint40"
            }
          ]
        },
        "estaRegistrado(address)": {
          "seletor": "0xa1b8cb1c",
          "mutabilidade": "view",
          "entradas": [
            {
              "nome": "quem",
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
        "fabrica()": {
          "seletor": "0xb5b306ec",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "implantarCofre(address)": {
          "seletor": "0xa3f00f5a",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "base",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "cofre",
              "tipo": "address"
            },
            {
              "nome": "cerca",
              "tipo": "address"
            }
          ]
        },
        "parametros()": {
          "seletor": "0x4666b679",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "registrar()": {
          "seletor": "0x2b20e397",
          "mutabilidade": "nonpayable",
          "entradas": [],
          "saidas": []
        },
        "totalDeCofres()": {
          "seletor": "0xe2ceb9fc",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "uint256"
            }
          ]
        }
      },
      "erros": {
        "0x90fc6269": {
          "assinatura": "BaseNaoPermitida(address)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            }
          ]
        },
        "0xb18e4b25": {
          "assinatura": "CofreJaExiste(address,address,address)",
          "entradas": [
            {
              "nome": "dono",
              "tipo": "address"
            },
            {
              "nome": "base",
              "tipo": "address"
            },
            {
              "nome": "cofre",
              "tipo": "address"
            }
          ]
        },
        "0xb2e9a9bf": {
          "assinatura": "EnderecoZerado()",
          "entradas": []
        },
        "0x45171dcf": {
          "assinatura": "JaRegistrado(address)",
          "entradas": [
            {
              "nome": "quem",
              "tipo": "address"
            }
          ]
        },
        "0xdd7f5bee": {
          "assinatura": "NaoRegistrado(address)",
          "entradas": [
            {
              "nome": "quem",
              "tipo": "address"
            }
          ]
        },
        "0x63d237cb": {
          "assinatura": "Reentrante()",
          "entradas": []
        }
      },
      "eventos": {
        "CofreCriado(address,address,address,uint256)": {
          "topico": "0x552f0a0568dd2a39f813531f7ce62d5fd2677784dc4900a0afb3b09476b630b8",
          "indexados": [
            "dono",
            "base"
          ]
        },
        "Registrado(address,uint40)": {
          "topico": "0x6f42fa0999a6a62b746ec86b02b83d1822f90460b44ed2a3dfeb112ab159bfbc",
          "indexados": [
            "dono"
          ]
        }
      }
    },
    "triviuFactory": {
      "contrato": "TriviuFactory",
      "funcoes": {
        "implantarCofre(address,address)": {
          "seletor": "0x4d87aa7c",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "dono",
              "tipo": "address"
            },
            {
              "nome": "base",
              "tipo": "address"
            }
          ],
          "saidas": [
            {
              "nome": "cofre",
              "tipo": "address"
            },
            {
              "nome": "cerca",
              "tipo": "address"
            }
          ]
        },
        "registro()": {
          "seletor": "0x3d6c57a7",
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
        "0xb2e9a9bf": {
          "assinatura": "EnderecoZerado()",
          "entradas": []
        },
        "0xff0a81c4": {
          "assinatura": "NaoEOregistro(address,address)",
          "entradas": [
            {
              "nome": "quemChamou",
              "tipo": "address"
            },
            {
              "nome": "registro",
              "tipo": "address"
            }
          ]
        }
      },
      "eventos": {
        "CercaImplantada(address,address,address,bytes32)": {
          "topico": "0xfb0150c6e64b7392b6fbb1d830069be343235c950f630d3ab73ebef91ef8341a",
          "indexados": [
            "dono",
            "cofre",
            "cerca"
          ]
        },
        "CofreImplantado(address,address,address,bytes32)": {
          "topico": "0x4aaeb28a942ece26ff449b150c166c8391dfcbad3613bc86a971508491fb572d",
          "indexados": [
            "dono",
            "cofre",
            "base"
          ]
        }
      }
    },
    "triviuVault": {
      "contrato": "TriviuVault",
      "funcoes": {
        "base()": {
          "seletor": "0x5001f3b5",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "ciclar(uint256,uint256,(uint8,address,address,address,uint24,uint256)[])": {
          "seletor": "0x27269a41",
          "mutabilidade": "nonpayable",
          "entradas": [
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
          "saidas": [
            {
              "nome": "crescimento",
              "tipo": "uint256"
            }
          ]
        },
        "comandante()": {
          "seletor": "0x82c98f09",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "criador()": {
          "seletor": "0x041c797c",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "definirComandante(address)": {
          "seletor": "0x03e301f5",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "novo",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "definirComandanteInicial(address)": {
          "seletor": "0xa2f33fe8",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "novo",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "definirMotor(address)": {
          "seletor": "0xa9a98819",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "novo",
              "tipo": "address"
            }
          ],
          "saidas": []
        },
        "depositar(uint256)": {
          "seletor": "0xd5ca6228",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "quantia",
              "tipo": "uint256"
            }
          ],
          "saidas": []
        },
        "dono()": {
          "seletor": "0x70514bea",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "motor()": {
          "seletor": "0xbdd346cf",
          "mutabilidade": "view",
          "entradas": [],
          "saidas": [
            {
              "nome": "",
              "tipo": "address"
            }
          ]
        },
        "resgatar(address,uint256)": {
          "seletor": "0x48b2116c",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "quantia",
              "tipo": "uint256"
            }
          ],
          "saidas": []
        },
        "sacar(uint256)": {
          "seletor": "0x7371b0d6",
          "mutabilidade": "nonpayable",
          "entradas": [
            {
              "nome": "quantia",
              "tipo": "uint256"
            }
          ],
          "saidas": []
        }
      },
      "erros": {
        "0x8e525175": {
          "assinatura": "AprovacaoRecusada(address,address,uint256)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "gastador",
              "tipo": "address"
            },
            {
              "nome": "quantia",
              "tipo": "uint256"
            }
          ]
        },
        "0x67d012e2": {
          "assinatura": "CofreEncolheu(uint256,uint256)",
          "entradas": [
            {
              "nome": "antes",
              "tipo": "uint256"
            },
            {
              "nome": "depois",
              "tipo": "uint256"
            }
          ]
        },
        "0xb2e9a9bf": {
          "assinatura": "EnderecoZerado()",
          "entradas": []
        },
        "0x72fea6f1": {
          "assinatura": "MotorAusente()",
          "entradas": []
        },
        "0x05a53319": {
          "assinatura": "MotorSemCodigo(address)",
          "entradas": [
            {
              "nome": "informado",
              "tipo": "address"
            }
          ]
        },
        "0x4c54b53d": {
          "assinatura": "NaoEComandante(address,address)",
          "entradas": [
            {
              "nome": "quemChamou",
              "tipo": "address"
            },
            {
              "nome": "comandante",
              "tipo": "address"
            }
          ]
        },
        "0x389d1855": {
          "assinatura": "NaoEDono(address,address)",
          "entradas": [
            {
              "nome": "quemChamou",
              "tipo": "address"
            },
            {
              "nome": "dono",
              "tipo": "address"
            }
          ]
        },
        "0xf9ff1132": {
          "assinatura": "NaoEOcriador(address,address)",
          "entradas": [
            {
              "nome": "quemChamou",
              "tipo": "address"
            },
            {
              "nome": "criador",
              "tipo": "address"
            }
          ]
        },
        "0x26d0f711": {
          "assinatura": "PortaoInicialQueimado()",
          "entradas": []
        },
        "0x4158e8af": {
          "assinatura": "QuantiaZero()",
          "entradas": []
        },
        "0x63d237cb": {
          "assinatura": "Reentrante()",
          "entradas": []
        },
        "0x9d8b89ca": {
          "assinatura": "SaldoInsuficiente(uint256,uint256)",
          "entradas": [
            {
              "nome": "pedido",
              "tipo": "uint256"
            },
            {
              "nome": "disponivel",
              "tipo": "uint256"
            }
          ]
        },
        "0x381d5008": {
          "assinatura": "TransferenciaFalhou(address,address,uint256)",
          "entradas": [
            {
              "nome": "token",
              "tipo": "address"
            },
            {
              "nome": "para",
              "tipo": "address"
            },
            {
              "nome": "quantia",
              "tipo": "uint256"
            }
          ]
        }
      },
      "eventos": {
        "CicloExecutado(address,uint256,uint256,uint256)": {
          "topico": "0xa892831571b0d9ea453c285a4408dd96245b715db2c1d16a99cb8ea1143c9eb5",
          "indexados": [
            "comandante"
          ]
        },
        "ComandanteInicialDefinido(address,address)": {
          "topico": "0x838b5c08a3a0af665f4d034a4c456f7ae84afa39209e6736ec4f61f9d65e9948",
          "indexados": [
            "criador",
            "comandante"
          ]
        },
        "ComandanteTrocado(address,address)": {
          "topico": "0x542c47b617509d3bf80dfd340b6e0e96de4804ef8c11c9c8411601a578574de1",
          "indexados": [
            "anterior",
            "novo"
          ]
        },
        "Depositado(address,uint256,uint256)": {
          "topico": "0xea84ab1b96a4df052463c82c30614a8f1e466190b2cba7bf294b6fb8a77b9b20",
          "indexados": [
            "dono"
          ]
        },
        "MotorTrocado(address,address)": {
          "topico": "0x960b278426ed2aa1d73ea170b4945b738c4bb262723b7e8eb56c951401916dba",
          "indexados": [
            "anterior",
            "novo"
          ]
        },
        "Resgatado(address,uint256)": {
          "topico": "0xf17962786bafcb2e341f2a69218f7415fb48c0255371711441d91c35c240627b",
          "indexados": [
            "token"
          ]
        },
        "Sacado(address,uint256,uint256)": {
          "topico": "0x60eabf5e87601ab6724ae82428cd0877effe067b5dc75cd198813be5dd3c1342",
          "indexados": [
            "dono"
          ]
        }
      }
    }
  },
  "extras": {
    "uniswapFactory": {
      "origem": "UniswapV3Factory (terceiro; 0x1F98431c8aD98523631AE4a59f267346ea31F984 na 137)",
      "funcoes": {
        "getPool(address,address,uint24)": {
          "seletor": "0x1698ee82"
        }
      }
    },
    "uniswapPool": {
      "origem": "UniswapV3Pool (terceiro; endereco vem de getPool, nunca digitado)",
      "funcoes": {
        "slot0()": {
          "seletor": "0x3850c7bd"
        }
      }
    },
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
    "erc721": {
      "origem": "EIP-721 · ausente de todo artefato deste repositorio · despacho conferido ao vivo contra o position manager em 2026-08-12 (reverte com Error(string) do proprio contrato; funcao inexistente reverte vazia)",
      "funcoes": {
        "approve(address,uint256)": {
          "seletor": "0x095ea7b3"
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
