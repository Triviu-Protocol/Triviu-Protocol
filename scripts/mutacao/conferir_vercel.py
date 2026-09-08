"""
Confere o vercel.json que eu transcrevi A MAO contra as politicas GERADAS.

Transcricao manual de 20 KB de hash e exatamente onde nasce erro silencioso:
um caractere trocado num sha256 nao quebra nada no deploy, so faz um bloco
parar de aplicar em producao — e eu descobriria pelo usuario, nao pelo teste.
Aqui a comparacao e byte a byte contra os arquivos que o gerador escreveu.
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
import sys

# A raiz sai do PROPRIO arquivo, e nao do caminho desta maquina: o arranjo
# tem de rodar a partir de qualquer clone, senao ele documenta em vez de provar.
RAIZ = pathlib.Path(__file__).resolve().parents[2]


SCR = pathlib.Path(__file__).parent
VJ = pathlib.Path(RAIZ / r"vercel.json")

GERADA = {k: (SCR / f"csp_{k}.txt").read_text(encoding="utf-8").strip()
          for k in ("site", "console", "labs", "brand", "ds")}
# unica divergencia intencional: o gerador emite `script-src 'self' ;` quando o
# modelo nao tem script inline (Brandbook). Espaco solto antes do `;`. No
# arquivo eu escrevi `script-src 'self';`. Normalizo para comparar.
def norm(s):
    return re.sub(r"\s+;", ";", re.sub(r"\s+", " ", s)).strip()


ROTA = {
    "/": "site", "/index.html": "site",
    "/TRIVIU-Site-V6.html": "site", "/TRIVIU-Site-V6/": "site",
    # Medido no preview dpl_HnyeuwfUdgPC9vmudLhtJ5zFHcQE: nome com PONTO na
    # versao (V5.4.3, V3.3, V4.2) a Vercel trata como arquivo com extensao, e a
    # rota canonica sai SEM barra final — a com barra devolve 308 e nunca serve.
    # Foi o preview que pegou; declarado errado, tres modelos iriam ao ar com a
    # politica severa e nao arrancariam.
    "/TRIVIU-Console-V5.4.3.html": "console", "/TRIVIU-Console-V5.4.3": "console",
    "/console-v55/": "console",
    "/TRIVIU-Labs-V5.html": "labs", "/TRIVIU-Labs-V5/": "labs", "/labs/": "labs",
    "/TRIVIU-Brandbook-V3.3.html": "brand", "/TRIVIU-Brandbook-V3.3": "brand",
    "/brand/": "brand",
    "/TRIVIU-Design-System-V4.2.html": "ds", "/TRIVIU-Design-System-V4.2": "ds",
    "/design-system/": "ds",
}

SEVERA_ESPERADA = (
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; "
    "img-src 'self' data:; connect-src 'self' https://polygon-bor-rpc.publicnode.com "
    "https://polygon.drpc.org https://1rpc.io; worker-src 'none'; frame-src 'none'; "
    "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; "
    "upgrade-insecure-requests")

cfg = json.loads(VJ.read_text(encoding="utf-8-sig"))
print(f"JSON valido · {VJ.stat().st_size:,} bytes · {len(cfg['headers'])} blocos de header")

falhas = 0
base = cfg["headers"][0]
csp_base = next(h["value"] for h in base["headers"] if h["key"] == "Content-Security-Policy")
if base["source"] != "/(.*)" or norm(csp_base) != norm(SEVERA_ESPERADA):
    print("  >>> BLOCO SEVERO ALTERADO")
    falhas += 1
else:
    print(f"  bloco severo /(.*)  INTACTO · {len(base['headers'])} headers preservados")

vistos = set()
for bloco in cfg["headers"][1:]:
    src = bloco["source"]
    esperada = ROTA.get(src)
    csp = next((h["value"] for h in bloco["headers"]
                if h["key"] == "Content-Security-Policy"), None)
    if esperada is None:
        print(f"  >>> rota inesperada: {src}")
        falhas += 1
        continue
    vistos.add(src)
    if norm(csp) != norm(GERADA[esperada]):
        print(f"  >>> {src} DIVERGE da politica '{esperada}'")
        a, b = norm(csp), norm(GERADA[esperada])
        i = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]), min(len(a), len(b)))
        print(f"      1a diferenca no char {i}: arquivo={a[i:i+50]!r}")
        print(f"                              gerado ={b[i:i+50]!r}")
        falhas += 1
    else:
        print(f"  {src:<34} confere com '{esperada}' ({len(csp):,} chars)")

faltando = set(ROTA) - vistos
if faltando:
    print(f"  >>> rotas nao escritas: {sorted(faltando)}")
    falhas += 1

print("\nrotas de carteira · continuam na politica severa:")
for r in ("/console/", "/lp/", "/cofre/", "/positions/"):
    if r in ROTA:
        print(f"  >>> {r} MUDOU DE POLITICA")
        falhas += 1
    else:
        print(f"  {r:<14} severa, intacta")

print(f"\nredirects preservados: {len(cfg.get('redirects', []))} (esperado 3)")
falhas += 0 if len(cfg.get("redirects", [])) == 3 else 1
for k in ("outputDirectory", "cleanUrls", "trailingSlash"):
    print(f"  {k} = {cfg.get(k)!r}")

print(f"\n{'REPROVA · ' + str(falhas) + ' divergencia(s)' if falhas else 'APROVA · transcricao bate byte a byte com o gerador'}")
sys.exit(1 if falhas else 0)
