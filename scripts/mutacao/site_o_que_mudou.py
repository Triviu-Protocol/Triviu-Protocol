"""
O corpo do Site NAO bate com o modelo. Onde, exatamente?

Isto e a pergunta que decide se eu obedeci "sem TIRAR E NEM POR" ou se me
excedi. Delta de +2.953 b nao diz nada sozinho: pode ser a cabeca das
miniaturas dentro do template (que ele pediu) mais os 6 links que ele mandou
ligar — ou pode ser algo que eu mexi e nao contei.

Comparo por REGIAO, nao por hash do todo.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

import difflib
import hashlib
import json
import pathlib
import re

# A raiz sai do PROPRIO arquivo, e nao do caminho desta maquina: o arranjo
# tem de rodar a partir de qualquer clone, senao ele documenta em vez de provar.
RAIZ = pathlib.Path(__file__).resolve().parents[2]


MODELO = pathlib.Path(r"C:\Users\Alex\Documents\TRIVIU\Triviu_Modelos_Final"
                      r"\TRIVIU-Institutional-Site-Responsive-V2.html")
SERVIDO = pathlib.Path(RAIZ / r"site\index.html")

bm = MODELO.read_bytes()
bs = SERVIDO.read_bytes()
print(f"modelo  {len(bm):,} b   servido {len(bs):,} b   delta {len(bs)-len(bm):+,} b\n")

# ── 1 · as ilhas do bundler: manifest, template, ext_resources, page_order ──
ILHA = re.compile(rb'<script[^>]*type="(__bundler/[a-z_]+)"[^>]*>(.*?)</script>', re.S)


def ilhas(b):
    return {m.group(1).decode(): m.group(2) for m in ILHA.finditer(b)}


im, isv = ilhas(bm), ilhas(bs)
print("ILHAS do bundler:")
for k in sorted(set(im) | set(isv)):
    a, c = im.get(k, b""), isv.get(k, b"")
    marca = "IDENTICA" if a == c else f"DIFERE  ({len(c)-len(a):+,} b)"
    print(f"  {k:<26} {len(a):>9,} b  ->  {len(c):>9,} b   {marca}")

# ── 2 · o que sobra fora das ilhas ────────────────────────────────────────
def fora_das_ilhas(b):
    return ILHA.sub(b"<ILHA/>", b)


fm, fs = fora_das_ilhas(bm), fora_das_ilhas(bs)
print(f"\nFORA das ilhas: {len(fm):,} b -> {len(fs):,} b   "
      f"{'IDENTICO' if fm == fs else 'DIFERE'}")
if fm != fs:
    lm = fm.decode("utf-8", "replace").splitlines()
    ls = fs.decode("utf-8", "replace").splitlines()
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, lm, ls, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        print(f"  {tag} · linhas modelo {i1+1}-{i2} / servido {j1+1}-{j2}")
        for l in lm[i1:i2][:2]:
            print(f"      - {l.strip()[:150]}")
        for l in ls[j1:j2][:2]:
            print(f"      + {l.strip()[:150]}")

# ── 3 · dentro do template: o que exatamente mudou ────────────────────────
print("\nDENTRO do template (a pagina que o visitante ve):")
tm = json.loads(im["__bundler/template"])
ts = json.loads(isv["__bundler/template"])
print(f"  {len(tm):,} ch -> {len(ts):,} ch   delta {len(ts)-len(tm):+,}")

lm = tm.splitlines() or [tm]
ls = ts.splitlines() or [ts]
if len(lm) == 1 and len(ls) == 1:
    # linha unica gigante: compara por pedacos de tag
    lm = re.split(r"(?=<)", tm)
    ls = re.split(r"(?=<)", ts)

sm = difflib.SequenceMatcher(None, lm, ls, autojunk=False)
mudancas = 0
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == "equal":
        continue
    mudancas += 1
    print(f"\n  [{tag}] pedaco {i1}-{i2} -> {j1}-{j2}")
    for l in lm[i1:i2][:4]:
        print(f"      REMOVIDO  {l.strip()[:160]}")
    for l in ls[j1:j2][:6]:
        print(f"      ACRESCENT {l.strip()[:160]}")
print(f"\n  regioes alteradas no template: {mudancas}")

# ── 4 · a conta que importa: algum TEXTO visivel sumiu? ───────────────────
def so_texto(h):
    t = re.sub(r"<[^>]+>", " ", h)
    return re.sub(r"\s+", " ", t).strip()


txm, txs = so_texto(tm), so_texto(ts)
print(f"\nTEXTO VISIVEL do template: {len(txm):,} ch -> {len(txs):,} ch")
print(f"  identico: {txm == txs}")
if txm != txs:
    d = [x for x in difflib.ndiff(txm.split(), txs.split()) if x[0] in "+-"]
    print(f"  palavras diferentes: {len(d)}")
    for x in d[:20]:
        print(f"      {x}")
