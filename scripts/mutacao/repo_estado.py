"""
O que o GitHub da TRIVIU mostra HOJE, e o que esta desatualizado nele.

Pergunta do fundador: "voce ja atualizou o repositorio, como esta organizado,
com a nova imagem, todos os processos?"

Respondo medindo cada peca que um visitante ve, na ordem em que ele ve:
descricao, link do site, README, imagem do README, estrutura, esteira.
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
import subprocess

# A raiz sai do PROPRIO arquivo, e nao do caminho desta maquina: o arranjo
# tem de rodar a partir de qualquer clone, senao ele documenta em vez de provar.
RAIZ = pathlib.Path(__file__).resolve().parents[2]


MONO = RAIZ


def no_main(caminho):
    r = subprocess.run(["git", "show", f"origin/main:{caminho}"], cwd=MONO,
                       capture_output=True, encoding="utf-8", errors="replace")
    return r.stdout if r.returncode == 0 else None


print("=" * 78)
print("1 · A IMAGEM que o README aponta existe?")
print("=" * 78)
readme = no_main("README.md")
imgs = re.findall(r'<img[^>]*src="([^"]+)"', readme or "")
imgs += re.findall(r"!\[[^\]]*\]\(([^)]+)\)", readme or "")
for i in set(imgs):
    if i.startswith("http"):
        print(f"  {i:<44} (externa)")
        continue
    existe_main = no_main(i) is not None
    existe_disco = (MONO / i).exists()
    print(f"  {i:<44} no main: {existe_main}   no disco: {existe_disco}")

print("\n" + "=" * 78)
print("2 · O README menciona os MODELOS OFICIAIS e as rotas de hoje?")
print("=" * 78)
ALVOS = ["triviu.vercel.app", "/console/", "Whitepaper", "Labs", "Brandbook",
         "Design System", "V5.4.2", "Institutional", "cofre", "vault"]
for a in ALVOS:
    n = (readme or "").count(a)
    print(f"  {a:<22} {n}x")

print("\n" + "=" * 78)
print("3 · O README ainda descreve a LINHA que saiu do ar hoje?")
print("=" * 78)
for a in ["liquidity provision", "liquidity", "LPVault", "arbitrage", "triangular"]:
    print(f"  {a:<22} {(readme or '').count(a)}x")

print("\n" + "=" * 78)
print("4 · A ESTRUTURA de topo do repositorio (no main)")
print("=" * 78)
r = subprocess.run(["git", "ls-tree", "--name-only", "origin/main"], cwd=MONO,
                   capture_output=True, encoding="utf-8", errors="replace")
for l in r.stdout.strip().splitlines():
    print(f"  {l}")

print("\n" + "=" * 78)
print("5 · A ESTEIRA · quais workflows existem e o que eles olham")
print("=" * 78)
r = subprocess.run(["git", "ls-tree", "--name-only", "-r", "origin/main",
                    ".github/workflows/"], cwd=MONO,
                   capture_output=True, encoding="utf-8", errors="replace")
wf = [l for l in r.stdout.strip().splitlines() if l]
if not wf:
    print("  NENHUM workflow no main")
for w in wf:
    conteudo = no_main(w) or ""
    ramos = re.findall(r"branches:\s*\[([^\]]*)\]", conteudo)
    ramos += re.findall(r"(?m)^\s*-\s+([a-zA-Z0-9_/\-]+)\s*$",
                        (re.search(r"branches:\s*\n((?:\s*-\s*\S+\n)+)", conteudo) or
                         type("x", (), {"group": lambda s, n: ""})()).group(1) or "")
    roda = re.findall(r"(?m)^\s+run:\s*(.+)$", conteudo)
    print(f"\n  {w}")
    print(f"    ramos: {ramos or '(nao declarado)'}")
    print(f"    passos que rodam: {len(roda)}")
    for x in roda[:6]:
        print(f"      {x.strip()[:96]}")

print("\n" + "=" * 78)
print("6 · O que o DEPLOY tem e o main NAO tem, em arquivos")
print("=" * 78)
r = subprocess.run(["git", "diff", "--stat", "origin/main",
                    "origin/deploy/triviu-migracao-v7"], cwd=MONO,
                   capture_output=True, encoding="utf-8", errors="replace")
linhas = r.stdout.strip().splitlines()
print(f"  {len(linhas)-1} arquivo(s) diferentes")
for l in linhas[-1:]:
    print(f"  {l.strip()}")
