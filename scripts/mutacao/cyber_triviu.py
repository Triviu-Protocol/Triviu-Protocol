"""
Varredura de seguranca sobre o que a TRIVIU PUBLICA (Cyber Squad · frentes).

Regra desta casa que este arquivo obedece: julgar o que CHEGA A PRODUCAO, nao o
disco. O `.vercelignore` retem 30+ caminhos; medir sobre eles inverte o sinal —
ja produziu 34 falhas de CSP sobre bytes que nunca sobem.

Frentes, e quem responde por cada uma (habitat, nao assunto):
  piranha         varredura em cardume: segredo no byte publicado
  escorpiao       red-team: terceiro carregado, SRI que nao confere, opener
  tubarao-branco  Lei do Sangue: superficie que assina, aprovacao ilimitada
  crocodilo       exposicao legal: promessa de lucro/ausencia de risco
  hiena           forense: o que a resposta HTTP entrega de cabecalho
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
import sys

# A raiz sai do PROPRIO arquivo, e nao do caminho desta maquina: o arranjo
# tem de rodar a partir de qualquer clone, senao ele documenta em vez de provar.
RAIZ = pathlib.Path(__file__).resolve().parents[2]


MONO = RAIZ
SITE = MONO / "site"


def retidos():
    p = MONO / ".vercelignore"
    fora = []
    for l in p.read_text(encoding="utf-8").splitlines():
        l = l.strip()
        if l and not l.startswith("#"):
            fora.append(l.rstrip("/"))
    return fora


FORA = retidos()


def publica(rel):
    p = "site/" + rel
    return not any(p == i or p.startswith(i + "/") for i in FORA)


ARQ = sorted(
    (p, str(p.relative_to(SITE)).replace("\\", "/"))
    for p in SITE.rglob("*")
    if p.is_file()
)
PUB = [(p, r) for p, r in ARQ if publica(r)]
HTML = [(p, r) for p, r in PUB if r.endswith(".html")]
JS = [(p, r) for p, r in PUB if r.endswith(".js")]

print(f"arquivos no disco: {len(ARQ)}  ·  publicados: {len(PUB)}  ·  "
      f"retidos: {len(ARQ)-len(PUB)}")
print(f"HTML publicado: {len(HTML)}  ·  JS publicado: {len(JS)}")

achados = []


def achar(frente, sev, titulo, detalhe):
    achados.append((frente, sev, titulo, detalhe))


# ─────────────────────────────────────────────────────────────────────────────
# PIRANHA · segredo no byte publicado
#
# Por NOME, nao por valor: procurar o valor de um segredo exige ja conhece-lo.
# A chave que vaza e sempre a que ninguem listou.
SEGREDO = [
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "chave privada PEM"),
    (r"\b0x[0-9a-fA-F]{64}\b", "possivel chave privada de 32 bytes"),
    (r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.", "JWT"),
    (r"\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}", "chave de API secreta"),
    (r"\bAKIA[0-9A-Z]{16}\b", "chave AWS"),
    (r"\bgh[pousr]_[A-Za-z0-9]{30,}", "token GitHub"),
    (r"(?i)\b(private_?key|mnemonic|seed_?phrase|secret_?key)\s*[:=]\s*[\"'][^\"']{8,}",
     "segredo atribuido literal"),
    (r"(?i)\b(infura|alchemy|drpc|quicknode)[^\"'\s]*/(v\d/)?[A-Za-z0-9_-]{20,}",
     "URL de RPC com chave embutida"),
]
for p, r in PUB:
    if p.suffix.lower() not in (".html", ".js", ".json", ".css", ".txt", ".xml", ".md"):
        continue
    try:
        t = p.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        continue
    for rx, nome in SEGREDO:
        for m in re.finditer(rx, t):
            trecho = m.group(0)[:70]
            achar("piranha", "CRITICO", f"{nome} em {r}", trecho)

# ─────────────────────────────────────────────────────────────────────────────
# ESCORPIAO · terceiro carregado, e a integridade que promete e nao cumpre
TERCEIRO = re.compile(
    r"<(script|link)\b[^>]*\b(?:src|href)\s*=\s*[\"'](https?:)?//([^/\"']+)[^\"']*[\"'][^>]*>",
    re.I)
COM_INTEGRITY = re.compile(
    r"<(script|link)\b[^>]*\bintegrity\s*=\s*[\"']([^\"']+)[\"'][^>]*>", re.I)
SRC = re.compile(r"\b(?:src|href)\s*=\s*[\"']([^\"']+)[\"']", re.I)

hosts = {}
for p, r in HTML:
    t = p.read_text(encoding="utf-8", errors="ignore")
    for m in TERCEIRO.finditer(t):
        hosts.setdefault(m.group(3), []).append(r)
    # SRI que aponta para arquivo local: o hash tem de bater com o byte de hoje
    for m in COM_INTEGRITY.finditer(t):
        tag = m.group(0)
        integ = m.group(2)
        s = SRC.search(tag)
        if not s:
            continue
        alvo = s.group(1)
        if alvo.startswith(("http://", "https://", "//")):
            continue
        loc = SITE / alvo.lstrip("/") if alvo.startswith("/") else (p.parent / alvo)
        loc = loc.resolve()
        if not loc.exists():
            achar("escorpiao", "ALTO",
                  f"SRI aponta para arquivo que nao existe · {r}",
                  f"{alvo} · integrity={integ[:34]}")
            continue
        import base64
        alg = integ.split("-", 1)[0]
        h = hashlib.new({"sha256": "sha256", "sha384": "sha384", "sha512": "sha512"}
                        .get(alg, "sha384"), loc.read_bytes()).digest()
        esperado = f"{alg}-{base64.b64encode(h).decode()}"
        if esperado not in integ:
            achar("escorpiao", "ALTO",
                  f"SRI NAO confere com o byte servido · {r}",
                  f"{alvo}\n      declarado: {integ[:60]}\n      real:      {esperado[:60]}")

for h, ondes in sorted(hosts.items()):
    achar("escorpiao", "MEDIO", f"terceiro carregado: {h}",
          f"{len(set(ondes))} pagina(s): {', '.join(sorted(set(ondes))[:4])}")

# target=_blank sem rel=noopener (tabnabbing)
BLANK = re.compile(r"<a\b[^>]*target\s*=\s*[\"']_blank[\"'][^>]*>", re.I)
sem_opener = []
for p, r in HTML:
    t = p.read_text(encoding="utf-8", errors="ignore")
    for m in BLANK.finditer(t):
        if "noopener" not in m.group(0).lower() and "noreferrer" not in m.group(0).lower():
            sem_opener.append((r, m.group(0)[:90]))
if sem_opener:
    achar("escorpiao", "BAIXO", f"target=_blank sem rel=noopener · {len(sem_opener)} caso(s)",
          "\n      ".join(f"{r}: {x}" for r, x in sem_opener[:5]))

# ─────────────────────────────────────────────────────────────────────────────
# TUBARAO-BRANCO · superficie que assina
CARTEIRA = ["window.ethereum", "eth_requestAccounts", "eth_sendTransaction",
            "eth_signTypedData", "personal_sign", "eth_sign"]
APROVACAO_ILIMITADA = [
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "MaxUint256", "maxUint256", "2**256", "constants.MaxUint256",
]
assina = []
for p, r in PUB:
    if p.suffix.lower() not in (".html", ".js"):
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    if any(m in t for m in CARTEIRA):
        assina.append(r)
    for m in APROVACAO_ILIMITADA:
        if m in t:
            achar("tubarao-branco", "CRITICO",
                  f"marcador de aprovacao ILIMITADA em {r}", m)
print(f"\nsuperficie que alcanca assinatura: {len(assina)} arquivo(s)")
for r in assina:
    print(f"  {r}")

# a politica que a borda entrega em cada rota que assina
cfg = json.loads((MONO / "vercel.json").read_text(encoding="utf-8"))


def rota_de(rel):
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[:-len("index.html")]
    miolo = rel[:-len(".html")]
    return "/" + miolo if "." in miolo.split("/")[-1] else "/" + miolo + "/"


def casa(source, rota):
    if "(" not in source:
        return source == rota
    partes = [re.escape(x) for x in source.split("(.*)")]
    return re.fullmatch("(.*)".join(partes), rota) is not None


def politica(rota):
    achada = None
    for b in cfg.get("headers", []):
        csp = next((h["value"] for h in b.get("headers", [])
                    if h["key"].lower() == "content-security-policy"), None)
        if csp and casa(b["source"], rota):
            achada = b
    return achada


print("\npolitica entregue nas rotas que assinam:")
for r in [x for x in assina if x.endswith(".html")]:
    rota = rota_de(r)
    b = politica(rota)
    if not b:
        achar("tubarao-branco", "CRITICO", f"rota que assina SEM CSP · {rota}", r)
        continue
    d = {}
    for parte in b and next(h["value"] for h in b["headers"]
                            if h["key"].lower() == "content-security-policy").split(";"):
        t = parte.strip().split()
        if t:
            d[t[0].lower()] = t[1:]
    frouxo = [x for x in ("'unsafe-inline'", "'unsafe-eval'")
              if x in d.get("script-src", [])]
    print(f"  {rota:<16} bloco `{b['source']}`  script-src frouxo: {frouxo or 'nenhum'}")
    if frouxo:
        achar("tubarao-branco", "CRITICO",
              f"rota que ASSINA com script-src frouxo · {rota}", ", ".join(frouxo))

# ─────────────────────────────────────────────────────────────────────────────
# CROCODILO · promessa. A trava que so olha numero deixa passar a frase.
PROMESSA = [
    (r"(?i)\b(lucro|retorno|ganho)s?\s+(garantid|assegurad|cert)", "lucro garantido"),
    (r"(?i)\bsem\s+risco\b", "ausencia de risco"),
    (r"(?i)\brisco\s+zero\b", "risco zero"),
    (r"(?i)\bgarant(e|ia|ido)\s+(de\s+)?(lucro|retorno|rendimento|ganho)", "garantia de retorno"),
    (r"(?i)\brendimento\s+garantid", "rendimento garantido"),
    (r"(?i)\b(guaranteed|risk[- ]free|no\s+risk)\b", "promessa em ingles"),
    (r"(?i)\bvoc[eê]\s+(vai|ir[aá])\s+(lucrar|ganhar)", "promessa direta"),
]
for p, r in PUB:
    if p.suffix.lower() not in (".html", ".js"):
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    for rx, nome in PROMESSA:
        for m in re.finditer(rx, t):
            ctx = t[max(0, m.start()-60):m.end()+60].replace("\n", " ")
            achar("crocodilo", "ALTO", f"{nome} em {r}", ctx.strip()[:140])

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 78)
if not achados:
    print("VARREDURA SEM ACHADO em piranha/escorpiao/tubarao-branco/crocodilo.")
else:
    ordem = {"CRITICO": 0, "ALTO": 1, "MEDIO": 2, "BAIXO": 3}
    achados.sort(key=lambda a: (ordem[a[1]], a[0]))
    print(f"{len(achados)} achado(s):\n")
    for frente, sev, titulo, det in achados:
        print(f"[{sev:<7}] {frente:<15} {titulo}")
        for l in str(det).splitlines():
            print(f"      {l}")
        print()
sys.exit(0)
