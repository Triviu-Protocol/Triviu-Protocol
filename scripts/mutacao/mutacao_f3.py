"""
Mutacao do portao F-3 reescrito · ele fecha quando eu planto, ou e enfeite?

Roda numa COPIA de `_mono` no scratchpad. Mutar a arvore de verdade produziria
vermelho convincente que nao existe, e outra sessao le esse repo.

Sete casos. Cinco plantam defeito e exigem REPROVA. Um e controle e exige
silencio. E o setimo CEGA O DETECTOR: desliga a deteccao de carteira e replanta
o defeito do caso 1 — se o portao continuar reprovando, quem estava pegando era
outra coisa, e a deteccao de carteira era decoracao.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

import pathlib
import re
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
BASE = pathlib.Path(tempfile.mkdtemp(prefix="mut_mono_"))
GATE = "scripts/check-sem-estilo-inline.mjs"


def preparar():
    if BASE.exists():
        shutil.rmtree(BASE)
    BASE.mkdir(parents=True)
    shutil.copytree(ORIG / "scripts", BASE / "scripts")
    shutil.copytree(ORIG / "site", BASE / "site")
    # o .vercelignore entrou na copia em 2026-09-07: o portao passou a julgar
    # so o que PUBLICA, entao sem ele a copia nao reproduz o julgamento real
    for f in ("vercel.json", ".vercelignore"):
        shutil.copy2(ORIG / f, BASE / f)


def rodar():
    r = subprocess.run(["node", GATE], cwd=BASE, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", shell=True)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def cria(rel, conteudo):
    p = BASE / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(conteudo.encode("utf-8"))


def acrescenta(rel, texto):
    """Planta no FIM do arquivo. No Labs o `</body>` mora DENTRO do script
    inline, e inserir antes dele muda os bytes do script — o portao reprovaria
    por hash trocado, nao pelo defeito plantado."""
    p = BASE / rel
    p.write_bytes(p.read_bytes() + texto.encode("utf-8"))


def edita(rel, de, para, conta=1):
    """
    BYTE a byte. A primeira versao usava read_text/write_text, e no Windows isso
    traduz quebra de linha: o arquivo inteiro mudava de bytes e o portao
    reprovava por hash trocado, nao pelo defeito plantado. Caso que reprova pelo
    motivo errado e verde falso com roupa de vermelho.
    """
    p = BASE / rel
    b = p.read_bytes()
    d, a = de.encode("utf-8"), para.encode("utf-8")
    if d not in b:
        raise SystemExit(f"MUTACAO NAO APLICOU em {rel}: padrao ausente")
    p.write_bytes(b.replace(d, a, conta))


CASOS = [
    ("controle · nada mutado", "PASSA", lambda: None),
    ("unsafe-inline de estilo na politica SEVERA (rotas que assinam)", "REPROVA",
     lambda: edita("vercel.json",
                   "script-src 'self'; style-src 'self'; font-src 'self'",
                   "script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'")),
    ("Site perde 'unsafe-hashes' · 2 style= do carregador morrem", "REPROVA",
     lambda: edita("vercel.json",
                   "style-src 'self' 'unsafe-hashes' https://fonts.googleapis.com",
                   "style-src 'self' https://fonts.googleapis.com", 4)),
    ("style= novo plantado no Labs · nenhum hash o cobre", "REPROVA",
     lambda: edita("site/TRIVIU-Labs-V5.html", "<body", '<body style="outline:3px solid magenta"')),
    ("Console perde 'unsafe-inline' · 59 atributos morrem", "REPROVA",
     lambda: edita("vercel.json", "style-src 'self' 'unsafe-inline';", "style-src 'self';", 3)),
    ("bloco <style> novo no Brandbook · nenhum hash o cobre", "REPROVA",
     lambda: edita("site/TRIVIU-Brandbook-V3.3.html", "</head>",
                   "<style>body{outline:9px dotted lime}</style></head>")),
    # REGRA 5 · style= que um script escreve, numa rota sem 'unsafe-inline'.
    #
    # Os dois casos que miravam `console-v0.js` sairam em 2026-09-07: o arquivo
    # saiu do ar com o console antigo e nenhuma pagina o carrega, entao a regra
    # nem chega nele — o caso passava a testar nada. E plantar na rota do
    # console tambem nao serve: ela tem 'unsafe-inline' de estilo, e ali a regra
    # corretamente nao se aplica. O alvo tem de ser uma rota que proibe.
    ("script novo com style= gerado em rota que proibe inline", "REPROVA",
     lambda: (cria("site/js/novo.js", "el.innerHTML = '<div style=\"color:red\"></div>';"),
              acrescenta("site/TRIVIU-Labs-V5.html", '<script src="/js/novo.js"></script>'))),
    # REGRAS NOVAS de 2026-09-07 · o portao julga o que PUBLICA
    ("declaracao de divida para arquivo que ninguem carrega", "REPROVA",
     lambda: edita("scripts/check-sem-estilo-inline.mjs",
                   "const ESTILO_GERADO_DECLARADO = {};",
                   'const ESTILO_GERADO_DECLARADO = {"site/js/fantasma.js":{n:1,motivo:"x"}};')),
    ("pagina retida volta a publicar sem politica propria", "REPROVA",
     lambda: edita(".vercelignore", "site/console-v55", "site/console-v55-outro")),
    ("DETECTOR CEGO · naoPublica() sempre verdadeiro + defeito em pagina viva", "PASSA",
     lambda: (edita("scripts/csp-por-rota.mjs",
                    'const p = "site/" + relSite;',
                    'const p = "site/" + relSite; return true;'),
              edita("site/TRIVIU-Labs-V5.html", "<body", '<body style="outline:3px solid magenta"'))),
    ("DETECTOR CEGO · podeAssinar() sempre falso + o defeito do caso 2", "PASSA",
     lambda: (edita("scripts/csp-por-rota.mjs",
                    "  return { assina: provas.length > 0, provas: [...new Set(provas)] };",
                    "  return { assina: false, provas: [] };"),
              edita("vercel.json",
                    "script-src 'self'; style-src 'self'; font-src 'self'",
                    "script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'"))),
]

print(f"{'caso':<62} {'esperado':>9} {'saiu':>8} {'':>4}")
print("-" * 88)
falhas = 0
for nome, esperado, mutar in CASOS:
    preparar()
    mutar()
    cod, saida = rodar()
    saiu = "REPROVA" if cod else "PASSA"
    ok = saiu == esperado
    falhas += 0 if ok else 1
    print(f"{nome:<62} {esperado:>9} {saiu:>8} {'ok' if ok else '<<< ERRADO':>4}")
    if not ok:
        print("    " + "\n    ".join(saida.strip().splitlines()[-6:]))

shutil.rmtree(BASE, ignore_errors=True)
print(f"\n{'APROVA' if not falhas else 'REPROVA'} · mutacao {len(CASOS)-falhas}/{len(CASOS)}")
print("  o caso do detector cego prova que a deteccao de carteira e o que pega o caso 2:")
print("  desligada ela, o MESMO defeito atravessa o portao sem um ruido.")
sys.exit(1 if falhas else 0)
