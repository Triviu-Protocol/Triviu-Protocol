"""
Mutacao dos quatro portoes que passaram a podar o que o .vercelignore retem.

Podar e afrouxar por construcao: todo arquivo removido do julgamento e um lugar
onde o portao deixou de olhar. Se a poda for larga demais, os quatro ficam
verdes sobre o site inteiro — o defeito exato que a poda existe para nao criar.

Entao cada portao e atacado em DUAS direcoes:
  (a) planta o defeito que ele caca num arquivo PUBLICADO -> tem de ficar VERMELHO
  (b) planta o MESMO defeito num arquivo RETIDO           -> tem de continuar VERDE

(a) prova que ele ainda enxerga. (b) prova que a poda faz o que diz.
Sem (a), a poda poderia ter cegado tudo e ninguem saberia.
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
BASE = pathlib.Path(tempfile.mkdtemp(prefix="mut_poda_"))


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
    for d in ("whitepaper", "decisions"):
        if (ORIG / d).is_dir():
            shutil.copytree(ORIG / d, BASE / d)
    for f in ("README.md",):
        if (ORIG / f).exists():
            shutil.copy2(ORIG / f, BASE / f)


def rodar(portao):
    r = subprocess.run(["node", f"scripts/{portao}"], cwd=BASE, shell=True,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def acrescenta(rel, texto):
    p = BASE / rel
    p.write_bytes(p.read_bytes() + texto.encode("utf-8"))


def edita(rel, de, para):
    p = BASE / rel
    b = p.read_bytes()
    if de.encode() not in b:
        raise SystemExit(f"MUTACAO NAO APLICOU em {rel}: ausente -> {de[:60]}")
    p.write_bytes(b.replace(de.encode(), para.encode(), 1))


# A frase que o check-multichain-honesty proibe em superficie de usuario.
FRASE = "\n<p>Triviu is not yet deployed on any chain.</p>\n"
# A escrita de saldo que o check-dinheiro-pintado caca.
DINHEIRO = "\nfunction pintar(o){ o.balance = 1.00; }\n"

CASOS = [
    ("multichain · controle", "check-multichain-honesty.mjs", "PASSA", lambda: None),
    ("multichain · frase proibida em pagina PUBLICADA (/cofre/)",
     "check-multichain-honesty.mjs", "REPROVA",
     lambda: acrescenta("site/cofre/index.html", FRASE)),
    ("multichain · a MESMA frase em pagina RETIDA (learn/)",
     "check-multichain-honesty.mjs", "PASSA",
     lambda: acrescenta("site/learn/index.html", FRASE)),

    ("dinheiro-pintado · controle", "check-dinheiro-pintado.mjs", "PASSA", lambda: None),
    ("dinheiro-pintado · saldo escrito em .js PUBLICADO (cofre.js)",
     "check-dinheiro-pintado.mjs", "REPROVA",
     lambda: acrescenta("site/js/cofre.js", DINHEIRO)),
    ("dinheiro-pintado · o MESMO em .js RETIDO (console-v0.js)",
     "check-dinheiro-pintado.mjs", "PASSA",
     lambda: acrescenta("site/js/console-v0.js", DINHEIRO)),

    ("assinatura · controle", "check-assinatura.mjs", "PASSA", lambda: None),
    ("assinatura · .js que fala com carteira, carregado por pagina PUBLICADA",
     "check-assinatura.mjs", "REPROVA",
     lambda: (
         (BASE / "site/js/intruso.js").write_text(
             "export async function pedir(){ return window.ethereum.request("
             "{method:'eth_sendTransaction',params:[{}]}); }\n", encoding="utf-8"),
         edita("site/cofre/index.html", "</body>",
               '<script src="/js/intruso.js"></script></body>'),
     )),
    ("assinatura · o MESMO .js carregado so por pagina RETIDA",
     "check-assinatura.mjs", "PASSA",
     lambda: (
         (BASE / "site/js/intruso.js").write_text(
             "export async function pedir(){ return window.ethereum.request("
             "{method:'eth_sendTransaction',params:[{}]}); }\n", encoding="utf-8"),
         edita("site/learn/index.html", "</body>",
               '<script src="/js/intruso.js"></script></body>'),
     )),

    ("alcance-dom · controle", "check-alcance-dom.mjs", "PASSA", lambda: None),

    ("CEGAR TODOS · .vercelignore retendo site/ inteiro",
     "check-csp.mjs", "REPROVA",
     lambda: acrescenta(".vercelignore", "\nsite\n")),
]

print(f"{'caso':<62} {'portao':<30} {'esperado':>9} {'saiu':>8}")
print("-" * 114)
falhas = 0
for nome, portao, esperado, mutar in CASOS:
    preparar()
    mutar()
    cod, saida = rodar(portao)
    saiu = "REPROVA" if cod else "PASSA"
    ok = saiu == esperado
    falhas += 0 if ok else 1
    print(f"{nome:<62} {portao:<30} {esperado:>9} {saiu:>8} {'' if ok else '<<< ERRADO'}")
    if not ok:
        for l in saida.strip().splitlines()[-8:]:
            print("      " + l[:150])

limpar(BASE)
print(f"\n{'APROVA' if not falhas else 'REPROVA'} · mutacao {len(CASOS)-falhas}/{len(CASOS)}")
sys.exit(1 if falhas else 0)
