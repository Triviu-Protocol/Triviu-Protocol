"""Quem aponta para quem, em site/. Inclui href RELATIVO, que o portao descarta."""

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
paginas = sorted(p.relative_to(SITE).as_posix() for p in SITE.rglob("*.html"))


def rota(rel):
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    miolo = rel[: -len(".html")]
    return "/" + miolo if "." in miolo.split("/")[-1] else "/" + miolo + "/"


rotas = {rel: rota(rel) for rel in paginas}
print(f"{len(paginas)} paginas\n")

apontadas_abs, apontadas_rel = set(), set()
por_pagina = {}
for rel in paginas:
    t = (SITE / rel).read_text(encoding="utf-8", errors="replace")
    # tira as ilhas de dados do bundler ANTES: link dentro de JSON e dado
    saidas = set()
    for m in re.finditer(r'href\s*=\s*["\']([^"\']+)["\']', t):
        h = m.group(1).split("#")[0].split("?")[0]
        if not h or re.match(r"^[a-z]+:", h, re.I):
            continue
        if h.startswith("/"):
            apontadas_abs.add(h if h.endswith("/") or "." in h.split("/")[-1] else h + "/")
            saidas.add(h)
        else:
            base = "/".join(rel.split("/")[:-1])
            alvo = (base + "/" + h).lstrip("/") if base else h
            apontadas_rel.add(alvo)
            saidas.add(h)
    por_pagina[rel] = saidas

print("=== saidas de cada modelo oficial ===")
for rel in ("index.html", "TRIVIU-Site-V6.html", "TRIVIU-Console-V5.4.3.html",
            "TRIVIU-Labs-V5.html", "TRIVIU-Brandbook-V3.3.html",
            "TRIVIU-Design-System-V4.2.html"):
    s = por_pagina.get(rel)
    if s is None:
        continue
    print(f"  {rel:<34} {len(s):>2} link(s): {sorted(s)[:8]}")

print("\n=== orfas segundo o portao (so href absoluto) vs alcancadas por relativo ===")
alvos_rel_rota = {rota(a) for a in apontadas_rel if a in rotas}
for rel in paginas:
    r = rotas[rel]
    if r == "/":
        continue
    abs_ok = r in apontadas_abs
    rel_ok = r in alvos_rel_rota
    if not abs_ok:
        print(f"  {r:<32} absoluto={'sim' if abs_ok else 'NAO':<4} relativo={'sim' if rel_ok else 'NAO'}")

print("\n=== alvos relativos que NAO existem no disco (link quebrado) ===")
quebrados = sorted(a for a in apontadas_rel if a not in rotas and a.endswith(".html"))
for q in quebrados:
    print(f"  {q}")
if not quebrados:
    print("  nenhum")
