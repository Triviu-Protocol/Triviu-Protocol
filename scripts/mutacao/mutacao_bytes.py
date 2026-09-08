"""
Mutacao · o portao de bytes de controle E o ramo do check-csp que nunca rodou.

O segundo importa mais. Consertar codigo que nunca executou e facil de declarar
e impossivel de acreditar sem exercita-lo: `escrito, testado, inalcancavel` e
uma falha ja catalogada aqui. Entao o caso 5 PLANTA um terceiro numa pagina
publicada e exige que o portao acuse com a ROTA certa — que era exatamente o
que a versao com NUL nao conseguia imprimir.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile

# A raiz sai do PROPRIO arquivo, e nao do caminho desta maquina: o arranjo
# tem de rodar a partir de qualquer clone, senao ele documenta em vez de provar.
RAIZ = pathlib.Path(__file__).resolve().parents[2]


ORIG = RAIZ
# A copia de trabalho nasce FORA da arvore, e a razao e um defeito medido:
# quando este arranjo morava no temp, `__file__.parent` era fora do repo; ao
# ser portado para dentro dele, o copytree passou a copiar a si mesmo em
# recursao ate o Windows recusar o caminho. mkdtemp nao depende de onde o
# arranjo mora.
BASE = pathlib.Path(tempfile.mkdtemp(prefix="mut_bytes_"))


def limpar(alvo):
    def forcar(func, caminho, _exc):
        os.chmod(caminho, stat.S_IWRITE)
        func(caminho)
    if alvo.exists():
        shutil.rmtree(alvo, onerror=forcar)


def preparar():
    """Copia a arvore INTEIRA menos o que e pesado ou gerado.

    A primeira versao copiava so `scripts`, `site`, `whitepaper` e `.github` —
    142 arquivos de texto contra os 341 reais. O controle reprovava no piso de
    cobertura do portao, e a leitura obvia era "o piso esta alto demais". Nao
    estava: o ARRANJO e que nao espelhava o que o CI ve.

    Arranjo que mede uma arvore menor do que a julgada produz vermelho que nao
    existe — e vermelho que nao existe ensina a baixar o piso, que e o oposto do
    que o piso serve para fazer.
    """
    limpar(BASE)
    BASE.mkdir(parents=True)
    ig = shutil.ignore_patterns("node_modules", ".git", "lib", "out", "cache",
                                "broadcast", "coverage", ".next", "dist", "build",
                                ".vercel", "__pycache__")
    for item in ORIG.iterdir():
        if item.name in ("node_modules", ".git", ".vercel"):
            continue
        if item.is_dir():
            shutil.copytree(item, BASE / item.name, ignore=ig, dirs_exist_ok=True)
        else:
            shutil.copy2(item, BASE / item.name)
    subprocess.run(["git", "init", "-q"], cwd=BASE, capture_output=True)
    bruto = subprocess.run(
        ["git", "cat-file", "blob", "3423f7f59157d241518ead194b3cbb2869da55da"],
        cwd=ORIG, capture_output=True).stdout
    subprocess.run(["git", "hash-object", "-w", "--stdin"], cwd=BASE,
                   input=bruto, capture_output=True)


def rodar(portao):
    r = subprocess.run(["node", f"scripts/{portao}"], cwd=BASE, shell=True,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def planta_byte(rel, byte):
    p = BASE / rel
    b = p.read_bytes()
    p.write_bytes(b[:60] + bytes([byte]) + b[60:])


def edita(rel, de, para):
    p = BASE / rel
    b = p.read_bytes()
    if de.encode("utf-8") not in b:
        raise SystemExit(f"MUTACAO NAO APLICOU em {rel}: {de[:70]}")
    p.write_bytes(b.replace(de.encode("utf-8"), para.encode("utf-8"), 1))


CASOS = [
    ("bytes · controle · nada mutado", "check-bytes-de-controle.mjs", "PASSA",
     lambda: None),
    ("bytes · NUL plantado num .mjs", "check-bytes-de-controle.mjs", "REPROVA",
     lambda: planta_byte("scripts/check-sitemap.mjs", 0x00)),
    ("bytes · FORM FEED plantado no workflow", "check-bytes-de-controle.mjs", "REPROVA",
     lambda: planta_byte(".github/workflows/ci.yml", 0x0c)),
    ("bytes · TAB e legitimo, nao pode reprovar", "check-bytes-de-controle.mjs", "PASSA",
     lambda: planta_byte("README.md", 0x09)),
    ("bytes · CEGAR · a allowlist de extensao fica vazia",
     "check-bytes-de-controle.mjs", "REPROVA",
     lambda: (planta_byte("scripts/check-sitemap.mjs", 0x00),
              edita("scripts/check-bytes-de-controle.mjs",
                    '".mjs", ".js", ".cjs"', '".extensao-que-nao-existe", ".js2", ".cjs2"'))),

    # ── o ramo do check-csp que nunca tinha executado ────────────────────────
    ("csp · controle", "check-csp.mjs", "PASSA", lambda: None),
    ("csp · <link> de terceiro numa pagina PUBLICADA acusa com a ROTA",
     "check-csp.mjs", "REPROVA",
     lambda: edita("site/cofre/index.html", '<link rel="stylesheet" href="/vendor/fonts/fontes.css">',
                   '<link rel="stylesheet" href="/vendor/fonts/fontes.css">'
                   '<link rel="stylesheet" href="https://cdn.exemplo.com/x.css">')),
]

print(f"{'caso':<58} {'portao':<32} {'esperado':>9} {'saiu':>8}")
print("-" * 112)
falhas = 0
for nome, portao, esperado, mutar in CASOS:
    preparar()
    try:
        mutar()
    except SystemExit as e:
        print(f"{nome:<58} {portao:<32} {'--':>9} {'NAO APLICOU':>8}  {e}")
        falhas += 1
        continue
    cod, saida = rodar(portao)
    saiu = "REPROVA" if cod else "PASSA"
    ok = saiu == esperado
    falhas += 0 if ok else 1
    print(f"{nome:<58} {portao:<32} {esperado:>9} {saiu:>8} {'' if ok else '<<< ERRADO'}")
    if nome.startswith("csp · <link>"):
        for l in saida.strip().splitlines():
            if "cdn.exemplo.com" in l:
                print(f"      >>> {l.strip()[:150]}")
    if not ok:
        for l in saida.strip().splitlines()[-5:]:
            print("      " + l[:150])

limpar(BASE)
print(f"\n{'APROVA' if not falhas else 'REPROVA'} · mutacao {len(CASOS)-falhas}/{len(CASOS)}")
sys.exit(1 if falhas else 0)
