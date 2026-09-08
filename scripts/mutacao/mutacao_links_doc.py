"""
Mutacao do portao de links de documentacao · LACRE L2.

Este portao ja errou uma vez, na primeira execucao, acusando 4 links pelo motivo
ERRADO — ele nao modelava a normalizacao de barra da borda nem a substituicao de
`$1`, entao caia no catch-all e reportava um destino literal `/$1`. Foi
consertado, mas "consertado" nao e um estado que se declara: e um estado que se
prova quebrando de novo.

Os dois casos de cegueira que importam aqui:
  · o recorte parar de achar `.md`  -> passa sobre zero URLs
  · a normalizacao voltar a faltar  -> volta a acusar rota valida
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
BASE = pathlib.Path(tempfile.mkdtemp(prefix="mut_links_"))
ALVO = "check-links-doc.mjs"


def limpar(alvo):
    def forcar(func, caminho, _exc):
        os.chmod(caminho, stat.S_IWRITE)
        func(caminho)
    if alvo.exists():
        shutil.rmtree(alvo, onerror=forcar)


def preparar():
    limpar(BASE)
    BASE.mkdir(parents=True)
    ig = shutil.ignore_patterns("node_modules", ".git", "lib", "out", "cache", "broadcast")
    shutil.copytree(ORIG / "scripts", BASE / "scripts", ignore=ig)
    shutil.copytree(ORIG / "site", BASE / "site", ignore=ig)
    shutil.copytree(ORIG / "whitepaper", BASE / "whitepaper", ignore=ig)
    for n in (".vercelignore", "vercel.json", "README.md"):
        shutil.copy2(ORIG / n, BASE / n)


def rodar():
    r = subprocess.run(["node", f"scripts/{ALVO}"], cwd=BASE, shell=True,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def edita(rel, de, para, conta=1):
    p = BASE / rel
    b = p.read_bytes()
    if de.encode("utf-8") not in b:
        raise SystemExit(f"MUTACAO NAO APLICOU em {rel}: ausente -> {de[:80]}")
    p.write_bytes(b.replace(de.encode("utf-8"), para.encode("utf-8"), conta))


CASOS = [
    ("controle · nada mutado", "PASSA", lambda: None),

    ("README passa a anunciar rota que nao existe", "REPROVA",
     lambda: edita("README.md", "https://triviu.vercel.app/whitepaper/",
                   "https://triviu.vercel.app/simulador-que-nunca-existiu/")),

    ("README anuncia arquivo que o .vercelignore retem", "REPROVA",
     lambda: edita("README.md", "https://triviu.vercel.app/console/",
                   "https://triviu.vercel.app/vendor/three-r128.min.js")),

    ("uma rota do README sai do ar sem ninguem trocar o link", "REPROVA",
     lambda: edita(".vercelignore", "site/labs\n", "site/labs\nsite/whitepaper\n")),

    ("link que so chega por REDIRECIONAMENTO passa, mas aparece", "PASSA",
     lambda: edita("README.md", "https://triviu.vercel.app/console/",
                   "https://triviu.vercel.app/TRIVIU-Console-V5.4.3")),

    ("CEGAR · o recorte deixa de achar .md", "REPROVA",
     lambda: edita("scripts/" + ALVO, 'nome.toLowerCase().endsWith(".md")',
                   'nome.toLowerCase().endsWith(".markdown-que-nao-existe")')),

    # A primeira versao deste caso NAO exercia nada: todos os links do corpus ja
    # terminam em barra, entao tirar a normalizacao nao mudava resultado nenhum.
    # Mutacao que nao toca o caminho testado nao prova coisa alguma. Agora o caso
    # PLANTA um link sem barra final — a forma que so passa COM normalizacao — e
    # so entao cega o detector.
    ("controle do plantio · link sem barra final passa (com normalizacao)", "PASSA",
     lambda: edita("README.md", "https://triviu.vercel.app/whitepaper/",
                   "https://triviu.vercel.app/whitepaper")),
    ("CEGAR · a normalizacao de barra some (volta o defeito da 1a versao)",
     "REPROVA",
     lambda: (edita("README.md", "https://triviu.vercel.app/whitepaper/",
                    "https://triviu.vercel.app/whitepaper"),
              edita("scripts/" + ALVO,
                    '  return ultimo.includes(".") ? rota : rota + "/";',
                    "  return rota;"))),
]

print(f"{'caso':<58} {'esperado':>9} {'saiu':>8}")
print("-" * 80)
falhas = 0
for nome, esperado, mutar in CASOS:
    preparar()
    try:
        mutar()
    except SystemExit as e:
        print(f"{nome:<58} {'--':>9} {'NAO APLICOU':>8}  {e}")
        falhas += 1
        continue
    cod, saida = rodar()
    saiu = "REPROVA" if cod else "PASSA"
    ok = saiu == esperado
    falhas += 0 if ok else 1
    print(f"{nome:<58} {esperado:>9} {saiu:>8} {'' if ok else '<<< ERRADO'}")
    if not ok:
        for l in saida.strip().splitlines()[-6:]:
            print("      " + l[:150])

limpar(BASE)
print(f"\n{'APROVA' if not falhas else 'REPROVA'} · mutacao {len(CASOS)-falhas}/{len(CASOS)}")
sys.exit(1 if falhas else 0)
