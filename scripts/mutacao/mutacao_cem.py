"""
Mutacao do estado "100%" · LACRE L2.

Chegar a 100% nao vale nada se nada impedir a volta. Cada porta que eu abri e
cada retirada que eu fiz tem de ter um portao que reprova quando alguem as
desfaz — inclusive por acidente.

E a mutacao obrigatoria e a que CEGA o detector: a lista de excecoes ficou
vazia, e lista vazia e exatamente o estado em que um portao pode ficar verde
por nao ter assunto.
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
BASE = pathlib.Path(tempfile.mkdtemp(prefix="mut_cem_"))


def limpar(alvo):
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
    for n in (".vercelignore", "vercel.json"):
        shutil.copy2(ORIG / n, BASE / n)
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


def edita(rel, de, para, conta=1):
    p = BASE / rel
    b = p.read_bytes()
    if de.encode("utf-8") not in b:
        raise SystemExit(f"MUTACAO NAO APLICOU em {rel}: ausente -> {de[:80]}")
    p.write_bytes(b.replace(de.encode("utf-8"), para.encode("utf-8"), conta))


def apaga_linhas(rel, marca):
    p = BASE / rel
    linhas = p.read_bytes().split(b"\n")
    p.write_bytes(b"\n".join(l for l in linhas if marca.encode() not in l))


BS = chr(92)
BAR = BS + "u002F"
Q = BS + '"'
FA = "<" + BAR + "a>"
EST = "display:block;margin:8px 0;color:var(--mut);font-size:13.5px"
PORTA_WP = f"<a href={Q}{BAR}whitepaper{BAR}{Q} style={Q}{EST}{Q}>Whitepaper{FA}"
PORTA_VA = f"<a href={Q}{BAR}cofre{BAR}{Q} style={Q}{EST}{Q}>Vault{FA}"

CASOS = [
    ("controle · nada mutado", "check-paginas-orfas.mjs", "PASSA", lambda: None),

    # O /whitepaper/ tem DUAS portas: o rodape do Site e a barra do /cofre/.
    # Tirar so uma NAO o isola — a primeira rodada esperava vermelho e saiu verde,
    # e quem estava errado era eu, nao o portao. Redundancia nao e defeito.
    ("tiram AS DUAS portas do Whitepaper", "check-paginas-orfas.mjs", "REPROVA",
     lambda: (edita("site/index.html", PORTA_WP, ""),
              edita("site/cofre/index.html",
                    '<a class="secundario" href="/whitepaper/">Whitepaper</a>', ""))),
    ("tirar SO UMA das duas portas do Whitepaper nao isola", "check-paginas-orfas.mjs", "PASSA",
     lambda: edita("site/index.html", PORTA_WP, "")),

    ("tiram a porta do Vault do rodape do Site", "check-paginas-orfas.mjs", "REPROVA",
     lambda: edita("site/index.html", PORTA_VA, "")),

    ("tiram a barra de irmas do /cofre/ (volta o beco sem saida)",
     "check-paginas-orfas.mjs", "REPROVA",
     lambda: edita("site/cofre/index.html",
                   '<a class="secundario" href="/positions/">Positions</a>', "")),

    ("a linha ANTIGA volta ao ar sem ninguem linkar (/lp/)",
     "check-paginas-orfas.mjs", "REPROVA",
     lambda: apaga_linhas(".vercelignore", "site/lp")),

    ("a linha ANTIGA volta ao ar sem ninguem linkar (/calldata/)",
     "check-paginas-orfas.mjs", "REPROVA",
     lambda: apaga_linhas(".vercelignore", "site/calldata")),

    ("CEGAR · reabrir excecao para pagina que hoje e alcancavel",
     "check-paginas-orfas.mjs", "REPROVA",
     lambda: edita("scripts/check-paginas-orfas.mjs",
                   "const EXCECOES = {",
                   'const EXCECOES = {\n  "/cofre/": "sem motivo, so para calar",')),

    ("CEGAR · regra do .vercelignore apontando para caminho inexistente",
     "check-paginas-orfas.mjs", "REPROVA",
     lambda: edita(".vercelignore", "site/lp\n", "site/lp\nsite/nao-existe\n")),

    ("sitemap · a rota retirada volta a ser indexada",
     "check-sitemap.mjs", "REPROVA",
     lambda: edita("site/sitemap.xml", "</urlset>",
                   "  <url><loc>https://triviu.vercel.app/lp/</loc></url>\n</urlset>")),

    # Duas tentativas erradas antes desta, e as duas ABORTARAM em vez de escrever
    # em lugar nenhum:
    #   1a  '"script-src ...'  — pus uma aspa dupla na frente, mas `script-src`
    #       nao abre o valor: ele vem depois de `default-src 'self'; `.
    #   2a  `script-src \'self\'` — eu li a BARRA INVERTIDA do `repr()` do Python
    #       como se fosse byte do arquivo. Nao e: repr escapa a apostrofe porque
    #       delimitou a string com apostrofe. O arquivo tem apostrofe pura.
    # A licao e a de sempre nesta casa: o que o console mostra nao e o byte.
    # A primeira ocorrencia e a do bloco `/(.*)`, que e o severo — e o alvo.
    ("CSP · a rota que assina perde a politica severa", "check-csp.mjs", "REPROVA",
     lambda: edita("vercel.json",
                   "script-src 'self';",
                   "script-src 'self' 'unsafe-inline';")),
]

print(f"{'caso':<58} {'portao':<28} {'esperado':>9} {'saiu':>8}")
print("-" * 108)
falhas = 0
for nome, portao, esperado, mutar in CASOS:
    preparar()
    try:
        mutar()
    except SystemExit as e:
        print(f"{nome:<58} {portao:<28} {'--':>9} {'NAO APLICOU':>8}  {e}")
        falhas += 1
        continue
    cod, saida = rodar(portao)
    saiu = "REPROVA" if cod else "PASSA"
    ok = saiu == esperado
    falhas += 0 if ok else 1
    print(f"{nome:<58} {portao:<28} {esperado:>9} {saiu:>8} {'' if ok else '<<< ERRADO'}")
    if not ok:
        for l in saida.strip().splitlines()[-6:]:
            print("      " + l[:150])

limpar(BASE)
print(f"\n{'APROVA' if not falhas else 'REPROVA'} · mutacao {len(CASOS)-falhas}/{len(CASOS)}")
sys.exit(1 if falhas else 0)
