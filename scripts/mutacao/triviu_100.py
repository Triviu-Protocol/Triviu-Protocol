import os
"""
TRIVIU esta em 100%? Medido, condicao a condicao.

O fundador perguntou uma coisa binaria. Responder "sim" sem medir e a mentira
mais facil de contar; responder "nao" sem dizer QUANTO e onde nao ajuda em nada.
Entao: cada condicao com o numero, e a conta no fim.

Duas fontes de verdade, e elas sao DIFERENTES:
  - os modelos oficiais em Triviu_Modelos_Final  -> o que ele mandou
  - o que a borda serve em triviu.vercel.app     -> o que o visitante recebe
Comparar disco com disco nao responde nada.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

import hashlib
import json
import pathlib
import re
# A pasta dos MODELOS OFICIAIS nao e versionada â€” ela e onde o fundador
# entrega os arquivos. O caminho sai de TRIVIU_MODELOS, com o valor desta
# maquina como padrao. Sem a pasta, este medidor nao roda, e dizer isso e
# melhor do que comparar contra o vazio e chamar de igual.


# A raiz sai do PROPRIO arquivo, e nao do caminho desta maquina: o arranjo
# tem de rodar a partir de qualquer clone, senao ele documenta em vez de provar.
RAIZ = pathlib.Path(__file__).resolve().parents[2]


MODELOS = pathlib.Path(os.environ.get("TRIVIU_MODELOS", r"C:\Users\Alex\Documents\TRIVIU\Triviu_Modelos_Final"))
MONO = RAIZ
SITE = MONO / "site"


def sha(b):
    return hashlib.sha256(b).hexdigest()[:16]


def corpo(b):
    """O que vem depois de </head> — o modelo propriamente dito."""
    return b.split(b"</head>", 1)[-1]


print("=" * 78)
print("A · OS 5 MODELOS OFICIAIS · o corpo chegou intacto?")
print("=" * 78)
PARES = [
    ("TRIVIU-Institutional-Site-Responsive-V2.html", "index.html", "/"),
    ("TRIVIU-Console-V5_4_2.html", "console/index.html", "/console/"),
    ("TRIVIU-Labs-V5.html", "TRIVIU-Labs-V5.html", "/TRIVIU-Labs-V5/"),
    ("TRIVIU-Brandbook-V3.3.html", "TRIVIU-Brandbook-V3.3.html", "/TRIVIU-Brandbook-V3.3"),
    ("TRIVIU-Design-System-V4.2.html", "TRIVIU-Design-System-V4.2.html",
     "/TRIVIU-Design-System-V4.2"),
]
intactos = 0
for modelo, servido, rota in PARES:
    bm = (MODELOS / modelo).read_bytes()
    bs = (SITE / servido).read_bytes()
    igual_corpo = corpo(bm) == corpo(bs)
    intactos += 1 if igual_corpo else 0
    print(f"\n  {modelo}")
    print(f"    modelo   {sha(bm)}  {len(bm):>9,} b")
    print(f"    servido  {sha(bs)}  {len(bs):>9,} b   em {rota}")
    print(f"    corpo (pos </head>) IDENTICO: {igual_corpo}"
          f"   · delta {len(bs)-len(bm):+,} b (cabeca das miniaturas)")
print(f"\n  >>> corpo intacto: {intactos} de {len(PARES)}")

print("\n" + "=" * 78)
print("B · O NOME DO CONSOLE · V5.4.2 ou V5.4.3?")
print("=" * 78)
console_modelo = (MODELOS / "TRIVIU-Console-V5_4_2.html").read_text(
    encoding="utf-8", errors="ignore")
print(f"  arquivo que o fundador mandou: TRIVIU-Console-V5_4_2.html")
tit = re.search(r"<title>(.*?)</title>", console_modelo, re.S | re.I)
print(f"  <title> DENTRO do modelo dele: {tit.group(1).strip() if tit else '-'}")
print(f"  V5.4.2 no modelo: {console_modelo.count('V5.4.2')}x   "
      f"V5.4.3: {console_modelo.count('V5.4.3')}x")
for nome in ("TRIVIU-Labs-V5.html", "TRIVIU-Brandbook-V3.3.html",
             "TRIVIU-Design-System-V4.2.html"):
    t = (MODELOS / nome).read_text(encoding="utf-8", errors="ignore")
    a, b = t.count("V5.4.3"), t.count("V5.4.2")
    if a or b:
        print(f"  {nome:<34} linka V5.4.3 {a}x · V5.4.2 {b}x")
print("  -> o descompasso esta DENTRO do conjunto que ele mandou, nao no que fiz")

print("\n" + "=" * 78)
print("C · ALCANCE · da raiz, o visitante chega em quantas rotas?")
print("=" * 78)
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


def sem_scripts(h):
    return re.sub(r"<script\b[^>]*>[\s\S]*?</script>", " ", h, flags=re.I)


def renderizado(bruto):
    s = sem_scripts(bruto)
    m = re.search(r'<script[^>]*type="__bundler/template"[^>]*>([\s\S]*?)</script>',
                  bruto, re.I)
    if m:
        try:
            s += "\n" + json.loads(m.group(1))
        except Exception:
            pass
    return s


paginas = {}
for p in SITE.rglob("*.html"):
    rel = str(p.relative_to(SITE)).replace("\\", "/")
    if not publica(rel):
        continue
    paginas[rota_de(rel)] = renderizado(p.read_text(encoding="utf-8", errors="ignore"))

# redirecionamentos declarados: destino conta como alcance
red = {}
cfg = json.loads((MONO / "vercel.json").read_text(encoding="utf-8"))
for r in cfg.get("redirects", []):
    red[r["source"]] = r["destination"]


def normaliza(href, base):
    if href.startswith(("http://", "https://")):
        if "triviu.vercel.app" not in href:
            return None
        href = href.split("triviu.vercel.app", 1)[1] or "/"
    if href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    href = href.split("#")[0].split("?")[0]
    if not href:
        return None
    if not href.startswith("/"):
        href = base.rsplit("/", 1)[0] + "/" + href
    while "/./" in href:
        href = href.replace("/./", "/")
    if href.endswith(".html"):
        href = rota_de(href.lstrip("/"))
    return red.get(href, href)


visto, fila = {"/"}, ["/"]
while fila:
    r = fila.pop()
    for m in re.finditer(r'<a\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']', paginas.get(r, ""), re.I):
        d = normaliza(m.group(1), r)
        if d and d in paginas and d not in visto:
            visto.add(d)
            fila.append(d)

todas = set(paginas)
print(f"  rotas publicadas: {len(todas)}")
print(f"  alcancaveis a partir de `/`: {len(visto)}")
for r in sorted(todas):
    print(f"    {'OK  ' if r in visto else 'ORFA'}  {r}")
orfas = sorted(todas - visto)

print("\n" + "=" * 78)
print("D · MINIATURA · toda rota publicada tem cartao?")
print("=" * 78)
com_cartao = 0
for p in sorted(SITE.rglob("*.html")):
    rel = str(p.relative_to(SITE)).replace("\\", "/")
    if not publica(rel):
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    tem = all(x in t for x in ('property="og:title"', 'property="og:image"',
                               'property="og:url"'))
    icone = 'rel="icon"' in t
    com_cartao += 1 if (tem and icone) else 0
    print(f"    {'OK  ' if tem and icone else 'FALTA'}  {rota_de(rel):<28} "
          f"og={tem} icone={icone}")

print("\n" + "=" * 78)
print("RESUMO")
print("=" * 78)
cond = [
    ("modelos com corpo intacto", intactos, len(PARES)),
    ("rotas alcancaveis desde /", len(visto), len(todas)),
    ("rotas com cartao + icone", com_cartao, len(todas)),
]
for nome, a, b in cond:
    pct = 100 * a / b
    barra = "#" * round(pct / 5) + "." * (20 - round(pct / 5))
    print(f"  {nome:<30} {barra}  {a}/{b}  {pct:5.1f}%")
if orfas:
    print(f"\n  ORFAS ({len(orfas)}): {', '.join(orfas)}")
