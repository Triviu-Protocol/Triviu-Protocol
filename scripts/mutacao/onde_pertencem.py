"""
PASSO 0 · onde cada rota orfa PERTENCE, medido e nao arbitrado.

Vou escolher a ordem e executar sem perguntar. Escolher sem medir seria
arbitrar. Tres perguntas decidem tudo:

  1. O Console (modelo oficial) linka para as telas da V0? Se linka e o destino
     nao existe, ligar e CONSERTO. Se nao linka, por link novo e ADICAO.
  2. As proprias orfas linkam entre si? Uma ilha conectada precisa de UMA porta,
     nao de cinco.
  3. Que rotulo cada orfa usa para se apresentar? O rotulo que ELA ja escreveu
     e o texto do link — nao um que eu invente.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

import json
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


def rota_de(rel):
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[:-len("index.html")]
    miolo = rel[:-len(".html")]
    return "/" + miolo if "." in miolo.split("/")[-1] else "/" + miolo + "/"


def renderizado(bruto):
    s = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", " ", bruto, flags=re.I)
    m = re.search(r'<script[^>]*type="__bundler/template"[^>]*>([\s\S]*?)</script>',
                  bruto, re.I)
    if m:
        try:
            s += "\n" + json.loads(m.group(1))
        except Exception:
            pass
    return s


paginas = {}
for p in sorted(SITE.rglob("*.html")):
    rel = str(p.relative_to(SITE)).replace("\\", "/")
    if publica(rel):
        paginas[rota_de(rel)] = (rel, renderizado(p.read_text(encoding="utf-8", errors="ignore")))

ORFAS = ["/whitepaper/", "/cofre/", "/positions/", "/calldata/", "/lp/"]

print("=" * 78)
print("1 · QUEM LINKA PARA QUEM (so <a href>, so o que publica)")
print("=" * 78)
grafo = {}
for rota, (rel, html) in sorted(paginas.items()):
    destinos = set()
    for m in re.finditer(r'<a\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']', html, re.I):
        h = m.group(1).split("#")[0].split("?")[0]
        if not h or h.startswith(("http", "mailto:", "tel:", "javascript:")):
            continue
        if not h.startswith("/"):
            h = rota.rstrip("/") + "/" + h if rota != "/" else "/" + h
        if h.endswith(".html"):
            h = rota_de(h.lstrip("/"))
        if not h.endswith("/") and h + "/" in paginas:
            h += "/"
        if h in paginas and h != rota:
            destinos.add(h)
    grafo[rota] = destinos
    print(f"  {rota:<28} -> {', '.join(sorted(destinos)) or '(nenhuma)'}")

print("\n" + "=" * 78)
print("2 · O CONSOLE OFICIAL menciona as telas da V0?")
print("=" * 78)
_, console = paginas["/console/"]
texto = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", console)).lower()
for chave in ("vault", "cofre", "position", "calldata", "liquidity", "lp ", "whitepaper"):
    print(f"  '{chave}' no texto do console: {texto.count(chave)}x")
print("\n  hrefs do console que NAO sao ancora:")
achou = False
for m in re.finditer(r'<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>(.*?)</a>', console, re.S | re.I):
    h = m.group(1)
    if h.startswith("#") or not h:
        continue
    achou = True
    rotulo = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(2))).strip()[:34]
    print(f"    {rotulo:<36} -> {h}")
if not achou:
    print("    NENHUM. O console so tem ancoras internas.")

print("\n" + "=" * 78)
print("3 · AS ORFAS ENTRE SI · e o rotulo que cada uma usa")
print("=" * 78)
for o in ORFAS:
    if o not in paginas:
        print(f"  {o} nao publica")
        continue
    rel, html = paginas[o]
    quem_aponta = [r for r, d in grafo.items() if o in d]
    tit = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    print(f"\n  {o}  ({rel})")
    print(f"    <title>  {(tit.group(1).strip() if tit else '-')[:64]}")
    print(f"    <h1>     {(re.sub(r'<[^>]+>', ' ', h1.group(1)).strip() if h1 else '-')[:64]}")
    print(f"    aponta para: {', '.join(sorted(grafo[o])) or '(nenhuma)'}")
    print(f"    e recebida de: {', '.join(quem_aponta) or 'NINGUEM'}")

print("\n" + "=" * 78)
print("4 · QUANTAS PORTAS bastam?")
print("=" * 78)
# componentes alcancaveis se eu abrir UMA porta em cada candidata
alcanc = {"/"}
fila = ["/"]
while fila:
    r = fila.pop()
    for d in grafo.get(r, ()):
        if d not in alcanc:
            alcanc.add(d)
            fila.append(d)
faltam = sorted(set(paginas) - alcanc)
print(f"  hoje alcanca: {len(alcanc)} de {len(paginas)}")
print(f"  faltam: {faltam}")
for cand in faltam:
    sub, f2 = {cand}, [cand]
    while f2:
        r = f2.pop()
        for d in grafo.get(r, ()):
            if d not in sub and d not in alcanc:
                sub.add(d)
                f2.append(d)
    print(f"    porta em {cand:<16} abriria {len(sub)}: {sorted(sub)}")
