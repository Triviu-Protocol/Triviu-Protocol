
# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------
"""
Mutacao dos dois portoes novos Â· LACRE L2.

Escrever o portao nao fecha o vetor. Quebrar a coisa guardada e ver VERMELHO
fecha â€” e a mutacao obrigatoria e a que CEGA o detector, nao so a que quebra o
alvo. Portao que fica verde quando lhe tiram o assunto e decoracao.

Roda numa COPIA. Duas razoes: producao le esta arvore, e a copia recebe um `git
init` proprio para que a afirmacao `git:<blob>` seja conferivel LA â€” senao o
controle sairia vermelho por falta de .git, que e a armadilha "a mutacao passou
pelo motivo errado" ja catalogada nesta casa.
"""
import pathlib
import shutil
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
BASE = pathlib.Path(tempfile.mkdtemp(prefix="mut_triviu_"))
BLOB = "3423f7f59157d241518ead194b3cbb2869da55da"


def limpar(alvo):
    """No Windows o .git guarda objetos SOMENTE-LEITURA e o rmtree comum falha
    calado com ignore_errors; a copia seguinte entao aborta em FileExistsError.
    Aqui o handler tira o bit de leitura e tenta de novo."""
    import os
    import stat

    def forcar(func, caminho, _exc):
        os.chmod(caminho, stat.S_IWRITE)
        func(caminho)

    if alvo.exists():
        shutil.rmtree(alvo, onerror=forcar)


def preparar():
    limpar(BASE)
    BASE.mkdir(parents=True)
    shutil.copytree(ORIG / "scripts", BASE / "scripts")
    shutil.copytree(ORIG / "site", BASE / "site")
    for nome in (".vercelignore", "vercel.json"):
        shutil.copy2(ORIG / nome, BASE / nome)
    # git proprio, com O MESMO blob: o hash de blob e do conteudo, entao
    # re-escreve-lo aqui produz o mesmo sha1 que la.
    subprocess.run(["git", "init", "-q"], cwd=BASE, capture_output=True)
    bruto = subprocess.run(["git", "cat-file", "blob", BLOB], cwd=ORIG,
                           capture_output=True).stdout
    r = subprocess.run(["git", "hash-object", "-w", "--stdin"], cwd=BASE,
                       input=bruto, capture_output=True, text=False)
    novo = r.stdout.decode().strip()
    if novo != BLOB:
        raise SystemExit(f"o blob nao reproduziu na copia: {novo} != {BLOB}")


def rodar(portao):
    r = subprocess.run(["node", f"scripts/{portao}"], cwd=BASE, shell=True,
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def edita(rel, de, para, conta=1):
    p = BASE / rel
    b = p.read_bytes()
    d, a = de.encode("utf-8"), para.encode("utf-8")
    if d not in b:
        raise SystemExit(f"MUTACAO NAO APLICOU em {rel}: ausente -> {de[:70]}")
    p.write_bytes(b.replace(d, a, conta))


def apaga(rel):
    (BASE / rel).unlink()


def apaga_linhas(rel, marca):
    p = BASE / rel
    linhas = p.read_bytes().split(b"\n")
    p.write_bytes(b"\n".join(l for l in linhas if marca.encode() not in l))


CASOS = [
    # â”€â”€ check-afirmacoes.mjs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ("afirmacoes Â· controle, nada mutado", "check-afirmacoes.mjs", "PASSA",
     lambda: None),
    ("afirmacoes Â· trocar um digito do sha afirmado", "check-afirmacoes.mjs", "REPROVA",
     lambda: edita(".vercelignore", "sha256=c24eb17b7075473f", "sha256=c24eb17b7075473e")),
    ("afirmacoes Â· mentir no bytes=", "check-afirmacoes.mjs", "REPROVA",
     lambda: edita(".vercelignore", "bytes=200249", "bytes=200248")),
    ("afirmacoes Â· o arquivo afirmado deixa de existir", "check-afirmacoes.mjs", "REPROVA",
     lambda: apaga("site/console-v55/index.html")),
    ("afirmacoes Â· mexer no BYTE do arquivo afirmado", "check-afirmacoes.mjs", "REPROVA",
     lambda: edita("site/labs/index.html", "<html", "<html ")),
    ("afirmacoes Â· blob do backup some do historico", "check-afirmacoes.mjs", "REPROVA",
     lambda: edita(".vercelignore", f"git:{BLOB}", "git:" + "0" * 40)),
    ("afirmacoes Â· CEGAR Â· encurtar o sha para 4 digitos", "check-afirmacoes.mjs", "REPROVA",
     lambda: edita(".vercelignore", "sha256=c24eb17b7075473f", "sha256=c24e")),
    ("afirmacoes Â· CEGAR Â· apagar TODA linha @afirma", "check-afirmacoes.mjs", "REPROVA",
     lambda: apaga_linhas(".vercelignore", "@afirma")),

    # â”€â”€ check-sitemap.mjs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ("sitemap Â· controle, nada mutado", "check-sitemap.mjs", "PASSA",
     lambda: None),
    ("sitemap Â· ressuscitar uma rota que saiu do ar", "check-sitemap.mjs", "REPROVA",
     lambda: edita("site/sitemap.xml", "</urlset>",
                   "  <url><loc>https://triviu.vercel.app/learn</loc></url>\n</urlset>")),
    ("sitemap Â· esquecer uma rota viva", "check-sitemap.mjs", "REPROVA",
     lambda: apaga_linhas("site/sitemap.xml", "/whitepaper/")),
    ("sitemap Â· URL de outra origem", "check-sitemap.mjs", "REPROVA",
     lambda: edita("site/sitemap.xml", "</urlset>",
                   "  <url><loc>https://exemplo.com/x</loc></url>\n</urlset>")),
    ("sitemap Â· canonical volta a perder a barra", "check-sitemap.mjs", "REPROVA",
     lambda: edita("site/positions/index.html",
                   'rel="canonical" href="https://triviu.vercel.app/positions/"',
                   'rel="canonical" href="https://triviu.vercel.app/positions"')),
    ("sitemap Â· og:url apontando para outra rota viva", "check-sitemap.mjs", "REPROVA",
     lambda: edita("site/cofre/index.html",
                   'property="og:url" content="https://triviu.vercel.app/cofre/"',
                   'property="og:url" content="https://triviu.vercel.app/lp/"')),
    ("sitemap Â· CEGAR Â· sitemap vazio, sem nenhuma <loc>", "check-sitemap.mjs", "REPROVA",
     lambda: apaga_linhas("site/sitemap.xml", "<loc>")),
    ("sitemap Â· CEGAR Â· apagar o sitemap.xml", "check-sitemap.mjs", "REPROVA",
     lambda: apaga("site/sitemap.xml")),
    ("sitemap Â· CEGAR Â· reter o sitemap no .vercelignore", "check-sitemap.mjs", "REPROVA",
     lambda: edita(".vercelignore", "site/labs\n", "site/labs\nsite/whitepaper\n")),
]

print(f"{'caso':<56} {'portao':<24} {'esperado':>9} {'saiu':>8}")
print("-" * 102)
falhas = 0
for nome, portao, esperado, mutar in CASOS:
    preparar()
    mutar()
    cod, saida = rodar(portao)
    saiu = "REPROVA" if cod else "PASSA"
    ok = saiu == esperado
    falhas += 0 if ok else 1
    print(f"{nome:<56} {portao:<24} {esperado:>9} {saiu:>8} {'' if ok else '<<< ERRADO'}")
    if not ok:
        for l in saida.strip().splitlines()[-7:]:
            print("      " + l[:150])

limpar(BASE)
print(f"\n{'APROVA' if not falhas else 'REPROVA'} Â· mutacao {len(CASOS)-falhas}/{len(CASOS)}")
sys.exit(1 if falhas else 0)

