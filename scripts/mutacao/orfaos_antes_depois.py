"""
Quais assets EU deixo orfaos, e quais JA estavam orfaos antes de eu tocar?

A distincao decide o que entra nesta onda e o que e divida herdada com nome. Uma
varredura que mistura as duas coisas apresenta limpeza de terceiros como
trabalho proprio, e apaga o registro de quando o lixo apareceu.
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


MONO = RAIZ
SITE = MONO / "site"

BASE = [l.strip().rstrip("/") for l in (MONO / ".vercelignore")
        .read_text(encoding="utf-8").splitlines()
        if l.strip() and not l.strip().startswith("#")]


def carregados(extra):
    """assets que alguma pagina PUBLICADA carrega, dado um conjunto de retidos"""
    ret = BASE + extra
    usados = {}
    for p in SITE.rglob("*.html"):
        rel = str(p.relative_to(SITE)).replace("\\", "/")
        alvo = "site/" + rel
        if any(alvo == i or alvo.startswith(i + "/") for i in ret):
            continue
        t = p.read_text(encoding="utf-8", errors="ignore")
        for s in re.findall(r'<(?:script[^>]*src|link[^>]*href)="(/[^"]+)"', t):
            usados.setdefault(s.lstrip("/"), set()).add(rel)
    return usados


def orfaos(extra):
    usados = carregados(extra)
    ret = BASE + extra
    saida = []
    for p in sorted(SITE.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in (".js", ".css"):
            continue
        rel = str(p.relative_to(SITE)).replace("\\", "/")
        alvo = "site/" + rel
        if any(alvo == i or alvo.startswith(i + "/") for i in ret):
            continue
        if rel not in usados:
            saida.append(rel)
    return set(saida)


antes = orfaos([])
depois = orfaos(["site/lp", "site/calldata"])
novos = sorted(depois - antes)
ja_eram = sorted(antes)

print(f"orfaos ANTES de tirar /lp/ e /calldata/: {len(ja_eram)}")
for r in ja_eram:
    n = (SITE / r).stat().st_size
    print(f"    {r:<46} {n:>9,} b   (divida HERDADA)")

print(f"\norfaos que ESTA onda cria: {len(novos)}")
for r in novos:
    n = (SITE / r).stat().st_size
    print(f"    {r:<46} {n:>9,} b   (sai junto)")

print(f"\ntotal que deixaria de ser servido: "
      f"{sum((SITE / r).stat().st_size for r in ja_eram + novos):,} b")

print("\n=== o three-r128 esta pinado no check-csp e ninguem o carrega? ===")
csp = (MONO / "scripts" / "check-csp.mjs").read_text(encoding="utf-8")
m = re.search(r"const VENDOR\s*=\s*\{(.*?)\}", csp, re.S)
if m:
    for linha in m.group(1).strip().splitlines():
        alvo = re.search(r'"([^"]+)"', linha)
        if alvo:
            a = alvo.group(1)
            existe = (SITE / a).exists()
            carregado = a in carregados(["site/lp", "site/calldata"])
            print(f"  {a:<40} existe={existe}  carregado por alguem={carregado}")
