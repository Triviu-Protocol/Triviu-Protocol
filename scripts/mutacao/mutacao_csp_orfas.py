"""
Mutacao dos dois portoes reescritos · check-csp e check-paginas-orfas.

Cada caso planta UM defeito e exige REPROVA; o controle exige silencio; e dois
casos CEGAM O DETECTOR para provar que quem pega e o mecanismo que eu digo que
pega, e nao outra coisa por acaso.

DUAS CORRECOES QUE ESTE ARQUIVO JA CUSTOU, e as duas produziam VERDE FALSO —
casos que reprovavam pelo motivo errado, que e pior do que caso que falha:

  1. Plantar antes de `</body>` no Labs caia DENTRO do script inline: o portao
     reprovava por hash de script trocado, nao pela carteira plantada.
  2. `read_text`/`write_text` no Windows TRADUZEM quebra de linha. O arquivo
     inteiro mudava de bytes, e de novo era o hash que reprovava. Agora tudo
     aqui e BYTE, sem traducao.

Roda numa copia. Mutar a arvore de verdade produz vermelho que nao existe, e
outra sessao le este repo.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

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
BASE = pathlib.Path(tempfile.mkdtemp(prefix="mut2_"))


def preparar():
    if BASE.exists():
        shutil.rmtree(BASE)
    BASE.mkdir(parents=True)
    shutil.copytree(ORIG / "scripts", BASE / "scripts")
    shutil.copytree(ORIG / "site", BASE / "site")
    for f in ("vercel.json", ".vercelignore"):
        shutil.copy2(ORIG / f, BASE / f)


def rodar(gate):
    r = subprocess.run(["node", f"scripts/{gate}"], cwd=BASE, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", shell=True)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def edita(rel, de, para, conta=1):
    """Byte a byte. Nada de traducao de quebra de linha."""
    p = BASE / rel
    b = p.read_bytes()
    d, a = de.encode("utf-8"), para.encode("utf-8")
    if d not in b:
        raise SystemExit(f"MUTACAO NAO APLICOU em {rel}: padrao ausente -> {de[:60]}")
    p.write_bytes(b.replace(d, a, conta))


def acrescenta(rel, texto):
    """Planta DEPOIS do fim do arquivo — fora de qualquer <script> ou <style>."""
    p = BASE / rel
    p.write_bytes(p.read_bytes() + texto.encode("utf-8"))


def cria(rel, conteudo):
    p = BASE / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(conteudo.encode("utf-8"))


BARRA = chr(92) + "u002F"   # a ilha do template escreve `/` assim
ASPA = chr(92) + '"'        # e `"` assim


def href_ilha(u):
    """O `href` como ele aparece DENTRO da ilha JSON, com o escape do bundler.

    Escrito por concatenacao de propositio: escrever o escape literal no fonte
    fez a ferramenta de edicao interpreta-lo e devolver a barra crua, e o
    padrao deixava de casar. Padrao que nao casa aborta o caso — mas se
    estivesse num `replace` silencioso, teria virado mutacao que nao muta nada
    e caso verde sem defeito plantado.
    """
    return "href=" + ASPA + u.replace("/", BARRA) + ASPA


CEGAR_CARTEIRA = (
    "scripts/csp-por-rota.mjs",
    "  return { assina: provas.length > 0, provas: [...new Set(provas)] };",
    "  return { assina: false, provas: [] };")
LABS_EVAL = ("vercel.json",
             "script-src 'self' 'sha256-q79sD4kqqR2IFZo0huckDXj/jNp68DMc6E0yWbfoOFU='",
             "script-src 'self' 'unsafe-eval' 'sha256-q79sD4kqqR2IFZo0huckDXj/jNp68DMc6E0yWbfoOFU='", 3)

CASOS = [
    ("check-csp.mjs", "controle", "PASSA", lambda: None),
    ("check-csp.mjs", "'unsafe-inline' de script na politica do Labs", "REPROVA",
     lambda: edita("vercel.json",
                   "script-src 'self' 'sha256-q79sD4kqqR2IFZo0huckDXj/jNp68DMc6E0yWbfoOFU='",
                   "script-src 'self' 'unsafe-inline' 'sha256-q79sD4kqqR2IFZo0huckDXj/jNp68DMc6E0yWbfoOFU='", 3)),
    ("check-csp.mjs", "'unsafe-eval' na politica SEVERA (rotas que assinam)", "REPROVA",
     lambda: edita("vercel.json",
                   "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'",
                   "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self'; font-src 'self'")),
    ("check-csp.mjs", "um byte trocado no hash do carregador do Site", "REPROVA",
     lambda: edita("vercel.json", "'sha256-WKhOvb/j3sDkmOUBc6FSOIxZ8RG6xq8SCj1ZR4mo4G0='",
                   "'sha256-WKhOvb/j3sDkmOUBc6FSOIxZ8RG6xq8SCj1ZR4mo4G1='", 4)),
    ("check-csp.mjs", "Console perde 'unsafe-hashes' · 12 onclick morrem", "REPROVA",
     lambda: edita("vercel.json", "script-src 'self' 'unsafe-hashes' 'sha256-+TKpQY3",
                   "script-src 'self' 'sha256-+TKpQY3", 3)),
    ("check-csp.mjs", "worker-src some da politica do Design System", "REPROVA",
     lambda: edita("vercel.json",
                   "connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests\"\n        }\n      ]\n    },\n    {\n      \"source\": \"/design-system/\"",
                   "connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests\"\n        }\n      ]\n    },\n    {\n      \"source\": \"/design-system/\"")),
    # A politica SEVERA e julgada SEM detector: 'unsafe-eval' ali reprova
    # incondicionalmente, porque ela serve todas as rotas que assinam. Cegar o
    # detector nao a alcanca. Para aferir o DETECTOR e preciso uma politica de
    # MODELO servindo uma pagina que alcance carteira.
    ("check-csp.mjs", "carteira plantada no Labs + 'unsafe-eval' na politica dele", "REPROVA",
     lambda: (acrescenta("site/TRIVIU-Labs-V5.html", "<!-- window.ethereum -->"),
              edita(*LABS_EVAL))),
    ("check-csp.mjs", "DETECTOR CEGO · o MESMO defeito, com podeAssinar() falso", "PASSA",
     lambda: (edita(*CEGAR_CARTEIRA),
              acrescenta("site/TRIVIU-Labs-V5.html", "<!-- window.ethereum -->"),
              edita(*LABS_EVAL))),

    ("check-paginas-orfas.mjs", "controle", "PASSA", lambda: None),
    ("check-paginas-orfas.mjs", "pagina nova que ninguem alcanca", "REPROVA",
     lambda: cria("site/nova-pagina.html", "<!doctype html><html><body>oi</body></html>")),
    ("check-paginas-orfas.mjs", "link relativo quebrado plantado no Labs", "REPROVA",
     lambda: edita("site/TRIVIU-Labs-V5.html", 'href="TRIVIU-Site-V6.html"',
                   'href="TRIVIU-Site-V7.html"')),
    # As tres formas de uma excecao envelhecer, e as tres mentem igual.
    ("check-paginas-orfas.mjs", "EXCECOES para rota que nao existe", "REPROVA",
     lambda: edita("scripts/check-paginas-orfas.mjs", '  "/calldata/": JA_ERA_ANTES,',
                   '  "/calldata/": JA_ERA_ANTES,\n  "/rota-fantasma/": JA_ERA_ANTES,')),
    ("check-paginas-orfas.mjs", "EXCECOES para pagina RETIRADA do ar", "REPROVA",
     lambda: edita("scripts/check-paginas-orfas.mjs", '  "/calldata/": JA_ERA_ANTES,',
                   '  "/calldata/": JA_ERA_ANTES,\n  "/learn/": JA_ERA_ANTES,')),
    ("check-paginas-orfas.mjs", "EXCECOES para pagina que voltou a ser alcancavel", "REPROVA",
     lambda: edita("scripts/check-paginas-orfas.mjs", '  "/calldata/": JA_ERA_ANTES,',
                   '  "/calldata/": JA_ERA_ANTES,\n  "/console/": JA_ERA_ANTES,')),
    ("check-paginas-orfas.mjs", ".vercelignore aponta para caminho inexistente", "REPROVA",
     lambda: edita(".vercelignore", "site/labs", "site/labs-que-nao-existe")),
    # A regra nova: link relativo resolve contra a ROTA SERVIDA, nao contra o
    # arquivo. Sem ela o portao ficava verde sobre 12 links do proprio modelo
    # morrendo em 404 na producao.
    ("check-paginas-orfas.mjs", "tirar 1 dos 4 redirecionamentos do Labs", "REPROVA",
     lambda: edita("vercel.json",
                   '      "source": "/TRIVIU-Labs-V5/TRIVIU-Site-V6/",\n'
                   '      "destination": "/",',
                   '      "source": "/TRIVIU-Labs-V5/NAO-EXISTE.html",\n'
                   '      "destination": "/TRIVIU-Console-V5.4.3",')),
    ("check-paginas-orfas.mjs", "href relativo para pagina inexistente no Brandbook", "REPROVA",
     lambda: edita("site/TRIVIU-Brandbook-V3.3.html", 'href="TRIVIU-Labs-V5.html"',
                   'href="TRIVIU-Labs-V9.html"')),
    ("check-paginas-orfas.mjs", "DETECTOR CEGO · resolver contra o ARQUIVO + tirar o redirecionamento", "PASSA",
     lambda: (edita("scripts/check-paginas-orfas.mjs",
                    'const base = rotaPag.endsWith("/") ? rotaPag : rotaPag.slice(0, rotaPag.lastIndexOf("/") + 1);',
                    'const base = "/" + (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "");'),
              edita("vercel.json",
                    '      "source": "/TRIVIU-Labs-V5/TRIVIU-Site-V6/",\n'
                    '      "destination": "/",',
                    '      "source": "/TRIVIU-Labs-V5/NAO-EXISTE.html",\n'
                    '      "destination": "/",'))),
    # A navegacao do Site mora dentro da ilha `__bundler/template`. Sem ler a
    # ilha, o portao nao ve link nenhum da home.
    ("check-paginas-orfas.mjs", "DETECTOR CEGO · nao ler a ilha do template", "REPROVA",
     lambda: edita("scripts/csp-por-rota.mjs",
                   '  let s = semScripts(bruto);\n  const m = bruto.match(',
                   '  let s = semScripts(bruto);\n  if (s) return s;\n  const m = bruto.match(')),
    # Reverter UM href so nao isola: o Labs continua alcancavel passando pelo
    # Brandbook, porque o grafo agora e conexo. Quem estava certo era o portao.
    # Para aferir a ligacao e preciso desfaze-la inteira.
    ("check-paginas-orfas.mjs", "desfazer os 6 href do Site (volta tudo a ancora)", "REPROVA",
     # o destino do console mudou para /console/ em 2026-09-07
     lambda: (edita("site/index.html", href_ilha("/console/"),
                    href_ilha("#preview"), 4),
              edita("site/index.html", href_ilha("/TRIVIU-Labs-V5/"),
                    href_ilha("#surfaces")),
              edita("site/index.html", href_ilha("/TRIVIU-Brandbook-V3.3"),
                    href_ilha("#name")))),
    # Este caso esperava PASSA ate 2026-09-07: cegar a caminhada escondia a
    # pagina orfa. Agora REPROVA, e por uma SEGUNDA regra — declarar tudo
    # alcancavel faz as excecoes declaradas parecerem dividas ja pagas, e o
    # guarda de declaracao velha dispara. Cegar um detector esbarra no outro;
    # a expectativa mudou porque o portao ficou mais forte, nao mais fraco.
    ("check-paginas-orfas.mjs", "DETECTOR CEGO · caminhada declara tudo alcancado", "REPROVA",
     lambda: (edita("scripts/check-paginas-orfas.mjs",
                    'const alcancadas = new Set(["/"]);',
                    "const alcancadas = new Set(paginas.map(rotaDe));"),
              cria("site/nova-pagina.html", "<!doctype html><html><body>oi</body></html>"))),
]

print(f"{'portao':<26} {'caso':<54} {'esperado':>9} {'saiu':>8}")
print("-" * 102)
falhas = 0
for gate, nome, esperado, mutar in CASOS:
    preparar()
    mutar()
    cod, saida = rodar(gate)
    saiu = "REPROVA" if cod else "PASSA"
    ok = saiu == esperado
    falhas += 0 if ok else 1
    print(f"{gate:<26} {nome:<54} {esperado:>9} {saiu:>8} {'' if ok else '<<< ERRADO'}")
    if not ok:
        for l in saida.strip().splitlines()[-4:]:
            print("      " + l[:150])

shutil.rmtree(BASE, ignore_errors=True)
print(f"\n{'APROVA' if not falhas else 'REPROVA'} · mutacao {len(CASOS)-falhas}/{len(CASOS)}")
sys.exit(1 if falhas else 0)
