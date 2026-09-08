"""
O TriviuLPVault guarda alguma coisa HOJE?

A ressalva do portao cita "ZERO USDC, ZERO WETH e ZERO POL" medido em
2026-08-24. Isso tem tres semanas. Tirar do ar a interface de um cofre que TEM
dinheiro deixa alguem sem porta — e a Lei do Sangue nao pergunta se a decisao
era arrumada.

Numero velho nao sustenta decisao nova. Meco agora, contra a chain.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

import json
import urllib.error
import urllib.request

RPCS = ["https://polygon-rpc.com", "https://polygon.llamarpc.com",
        "https://rpc.ankr.com/polygon", "https://polygon-bor-rpc.publicnode.com"]
LPVAULT = "0xC52BaD280809672D8EC5D1fcF2d7eCa45a2a423E"
TOKENS = {
    "USDC.e": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "USDC":   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    "WETH":   "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    "WMATIC": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
}
BALANCE_OF = "0x70a08231"


def chamar(rpc, metodo, params):
    corpo = json.dumps({"jsonrpc": "2.0", "id": 1, "method": metodo,
                        "params": params}).encode()
    req = urllib.request.Request(
        rpc, data=corpo,
        headers={"Content-Type": "application/json",
                 # 403 de RPC publico costuma ser User-Agent, nao credencial
                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())


rpc_ok = None
for rpc in RPCS:
    try:
        r = chamar(rpc, "eth_blockNumber", [])
        if "result" in r:
            rpc_ok = rpc
            print(f"RPC: {rpc}  ·  bloco {int(r['result'], 16):,}")
            break
    except Exception as e:
        print(f"  {rpc} falhou: {type(e).__name__}")
if not rpc_ok:
    raise SystemExit("nenhum RPC publico respondeu — NAO decido sem medir")

alvo = LPVAULT.lower().replace("0x", "").rjust(64, "0")

print(f"\nTriviuLPVault {LPVAULT}")
r = chamar(rpc_ok, "eth_getCode", [LPVAULT, "latest"])
codigo = r.get("result", "0x")
print(f"  bytecode: {len(codigo)//2 - 1:,} bytes  ({'contrato vivo' if len(codigo) > 4 else 'SEM CODIGO'})")

r = chamar(rpc_ok, "eth_getBalance", [LPVAULT, "latest"])
pol = int(r["result"], 16) / 1e18
print(f"  POL nativo: {pol:.6f}")

total_diferente_de_zero = 0
for nome, tok in TOKENS.items():
    r = chamar(rpc_ok, "eth_call",
               [{"to": tok, "data": BALANCE_OF + alvo}, "latest"])
    v = int(r.get("result", "0x0"), 16)
    dec = 6 if "USDC" in nome else 18
    if v:
        total_diferente_de_zero += 1
    print(f"  {nome:<8} {v / 10**dec:.6f}   (bruto {v})")

print("\n=== VEREDITO ===")
if pol == 0 and total_diferente_de_zero == 0:
    print("  O cofre da linha ANTIGA esta VAZIO nos quatro ativos medidos e em POL.")
    print("  Tirar a interface do ar nao deixa ninguem sem porta para dinheiro vivo.")
else:
    print("  HA SALDO. Tirar a interface do ar deixaria alguem sem porta.")
    print("  NAO retirar. A decisao muda: rotular a linha, nao esconde-la.")
