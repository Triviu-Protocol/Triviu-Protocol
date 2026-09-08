"""
Cada pagina publicada serve QUAL linha?

Isto subiu na frente da navegacao. Ligar uma tela e barato; ligar a tela errada
poe o visitante a assinar contra a linha ANTIGA achando que e o produto. A Lei
do Sangue nao pergunta se o link estava bonito.

Duas linhas medidas nesta casa:
  V0     · enderecos-v0.js + abi-v0-console.js · taxa 0,5% DO NEGOCIADO
  ANTIGA · enderecos.js    + abi-console.js    · TriviuLPVault 0xC52BaD28,
                                                 taxa 30% DO LUCRO

O criterio nao e o nome do arquivo: e QUAL LIVRO DE ENDERECOS a pagina carrega e
se ela alcanca assinatura.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

import pathlib
import re

# A raiz sai do PROPRIO arquivo, e nao do caminho desta maquina: o arranjo
# tem de rodar a partir de qualquer clone, senao ele documenta em vez de provar.
RAIZ = pathlib.Path(__file__).resolve().parents[2]


SITE = pathlib.Path(RAIZ / r"site")
MONO = SITE.parent

retidos = [l.strip().rstrip("/") for l in (MONO / ".vercelignore")
           .read_text(encoding="utf-8").splitlines()
           if l.strip() and not l.strip().startswith("#")]


def publica(rel):
    p = "site/" + rel
    return not any(p == i or p.startswith(i + "/") for i in retidos)


CARTEIRA = ["window.ethereum", "eth_requestAccounts", "eth_sendTransaction",
            "eth_signTypedData", "personal_sign", "eth_sign"]
LPVAULT = "0xc52bad280809672d8ec5d1fcf2d7eca45a2a423e"

print(f"{'rota':<28} {'livro':<16} {'assina?':<10} linha")
print("-" * 82)
for p in sorted(SITE.rglob("*.html")):
    rel = str(p.relative_to(SITE)).replace("\\", "/")
    if not publica(rel):
        continue
    rota = ("/" if rel == "index.html"
            else "/" + rel[:-len("index.html")] if rel.endswith("/index.html")
            else "/" + rel[:-5] + ("" if "." in rel[:-5].split("/")[-1] else "/"))
    t = p.read_text(encoding="utf-8", errors="ignore")
    scripts = re.findall(r'<script[^>]*src="([^"]+)"', t)

    livro = "—"
    if any("enderecos-v0" in s for s in scripts):
        livro = "enderecos-v0"
    elif any(s.endswith("/enderecos.js") for s in scripts):
        livro = "enderecos"

    assina, toca_lpvault = False, False
    for s in scripts:
        f = SITE / s.lstrip("/")
        if not f.exists():
            continue
        c = f.read_text(encoding="utf-8", errors="ignore")
        if any(m in c for m in CARTEIRA):
            assina = True
        if LPVAULT in c.lower():
            toca_lpvault = True
    if LPVAULT in t.lower():
        toca_lpvault = True

    if livro == "enderecos-v0":
        linha = "V0 (0,5% do negociado)"
    elif livro == "enderecos":
        linha = "ANTIGA (30% do lucro)" + (" · CARREGA o LPVault" if toca_lpvault else "")
    else:
        linha = "nenhuma · documento ou modelo"
    print(f"{rota:<28} {livro:<16} {('SIM' if assina else 'nao'):<10} {linha}")

print("\n=== o livro /enderecos.js carrega o LPVault? ===")
e = (SITE / "enderecos.js").read_text(encoding="utf-8", errors="ignore")
i = e.lower().find(LPVAULT)
if i != -1:
    print("  SIM · contexto:")
    print("    " + re.sub(r"\s+", " ", e[max(0, i - 240):i + 120]))
else:
    print("  nao")
