import os
"""
Monta a CSP POR ROTA dos modelos oficiais · e verifica o proprio instrumento.

Tres politicas, nao uma:

  SITE     · so `/` e `/TRIVIU-Site-V6.html`. E o unico artefato de bundler:
             carregador inline com hash + `'strict-dynamic'` (o carregador
             recria cada script por createElement, insercao por API, entao a
             confianca propaga) + `'unsafe-eval'`, exigido pelo `new Function`
             do proprio dc-runtime oficial (`evalDcLogic`, offset 30.466).

  PLANOS   · Console, Labs, Brandbook, Design System. HTML comum. So hash.
             SEM 'strict-dynamic', SEM 'unsafe-eval'. Nao precisam e nao levam.

  RESTO    · intocado. `/console/`, `/lp/`, `/cofre/`, `/positions/` — as rotas
             que tocam carteira — continuam na politica severa do vercel.json.

AUTO-AFERICAO: os 2 blocos de estilo que o runtime fabrica sozinho eu extraio
da FONTE do runtime e confiro contra os hashes que o NAVEGADOR calculou. Se o
meu extrator discordar do navegador, o script aborta em vez de publicar um
hash que so existe na minha cabeca.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

import base64
import gzip
import hashlib
import json
import pathlib
import re
import sys
# A pasta dos MODELOS OFICIAIS nao e versionada â€” ela e onde o fundador
# entrega os arquivos. O caminho sai de TRIVIU_MODELOS, com o valor desta
# maquina como padrao. Sem a pasta, este medidor nao roda, e dizer isso e
# melhor do que comparar contra o vazio e chamar de igual.


MOD = pathlib.Path(os.environ.get("TRIVIU_MODELOS", r"C:\Users\Alex\Documents\TRIVIU\Triviu_Modelos_Final"))
SITE_ARQ = "TRIVIU-Institutional-Site-Responsive-V2.html"
PLANOS = ["TRIVIU-Console-V5_4_2.html", "TRIVIU-Labs-V5.html",
          "TRIVIU-Brandbook-V3.3.html", "TRIVIU-Design-System-V4.2.html"]
EXEC = ("text/javascript", "module", "application/javascript", "")

# medido no navegador em 127.0.0.1:8908 · os 3 <style> vivos do documento
DO_NAVEGADOR = {
    2837: "'sha256-e0s8UZfZUU6lpSy2HRCkTldNxCYvtMU3ub0Q/ssD0Gk='",
    28: "'sha256-56hWXQs49OZ8g6ITZEhZJqd5or5GLdvfbopV5Pv4+yA='",
    0: "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
}


def h(s):
    return "'sha256-" + base64.b64encode(
        hashlib.sha256(s.encode("utf-8")).digest()).decode() + "'"


def ilha(t, tipo):
    m = re.search(rf'<script[^>]*type="__bundler/{tipo}"[^>]*>(.*?)</script>', t, re.S)
    return json.loads(m.group(1)) if m else None


def colher(t, scripts, estilos, attrs, com_script=True):
    if com_script:
        for m in re.finditer(r"<script([^>]*)>(.*?)</script>", t, re.S):
            atrs, corpo = m.group(1), m.group(2)
            if re.search(r"\bsrc\s*=", atrs):
                continue
            tp = re.search(r'type\s*=\s*["\']([^"\']+)', atrs)
            if tp and tp.group(1) not in EXEC:
                continue
            scripts.add(h(corpo))
    for m in re.finditer(r"<style[^>]*>(.*?)</style>", t, re.S):
        estilos.add(h(m.group(1)))
    for m in re.finditer(r'\sstyle\s*=\s*(["\'])(.*?)\1', t, re.S):
        attrs.add(h(m.group(2)))


# ───────────────────────── SITE ─────────────────────────
texto = (MOD / SITE_ARQ).read_text(encoding="utf-8", errors="replace")
s_scripts, s_estilos, s_attrs = set(), set(), set()

cru = re.sub(r'(?s)<script[^>]*type="__bundler/[^"]*"[^>]*>.*?</script>', " ", texto)
colher(cru, s_scripts, s_estilos, s_attrs)
# Os `style=` do documento EXTERNO — o indicador de carregamento — vivem antes
# do carregador trocar o documentElement. Minha medicao no navegador nao os
# alcancava: quando eu media, o documento antigo ja tinha ido embora. Quem os
# achou foi o portao F-3, lendo o arquivo em vez da tela. Estes precisam de hash;
# os 359 do template, nao — o React os monta por CSSOM.
s_attrs_externos = set(s_attrs)

manifest = ilha(texto, "manifest")

# O carregador troca cada uuid pela URL do recurso ANTES de inserir o template.
# O bloco @font-face de 9.587 b vira 509.541 b com as 10 fontes embutidas em
# `data:` — medido no navegador. Hashear o template CRU autoriza uma string que
# nunca chega a existir. Fonte -> `data:` e deterministico; qualquer outro
# recurso vira `blob:` sorteado e seria inhasheavel: marco e aborto se aparecer
# dentro de estilo, em vez de publicar um hash que nao vai bater.
FONT_MIME = re.compile(r"^(font/|application/(x-)?font-|application/vnd\.ms-fontobject)", re.I)
MARCA = "\x00BLOB\x00"
tpl = ilha(texto, "template")
n_fonte = 0
for uuid, e in manifest.items():
    mime = e.get("mime", "")
    if FONT_MIME.match(mime) and re.match(r"^[\w.+-]+/[\w.+-]+$", mime):
        dados = (base64.b64encode(gzip.decompress(base64.b64decode(e["data"]))).decode()
                 if e.get("compressed") else e["data"])
        tpl = tpl.replace(uuid, f"data:{mime};base64,{dados}")
        n_fonte += 1
    else:
        tpl = tpl.replace(uuid, MARCA)
for m in re.finditer(r"<style[^>]*>(.*?)</style>", tpl, re.S):
    if MARCA in m.group(1):
        sys.exit(f"ABORTA · bloco <style> de {len(m.group(1))} b contem blob: sorteado")
for m in re.finditer(r'\sstyle\s*=\s*(["\'])(.*?)\1', tpl, re.S):
    if MARCA in m.group(2):
        sys.exit("ABORTA · atributo style= contem blob: sorteado")
colher(tpl, s_scripts, s_estilos, s_attrs, com_script=False)
print(f"template · {n_fonte} fontes trocadas por data: antes de hashear")

# estilos que o RUNTIME fabrica · extraidos da fonte do modulo
rt = next(gzip.decompress(base64.b64decode(e["data"])).decode("utf-8", "replace")
          for e in manifest.values()
          if e.get("mime") == "text/javascript" and e.get("compressed")
          and "dc-runtime" in gzip.decompress(base64.b64decode(e["data"]))
          .decode("utf-8", "replace")[:400])

m = re.search(r"var BASE_CSS = `(.*?)`;", rt, re.S)
if not m:
    sys.exit("BASE_CSS nao encontrado na fonte do runtime")
base_css = m.group(1)
if "${" in base_css:
    sys.exit("BASE_CSS tem interpolacao · nao e hasheavel")

# O literal de template e CODIGO-FONTE: `\uXXXX` ocupa 6 bytes ali e 1 no valor
# que o navegador hasheia. Era essa a divergencia de 5 bytes que o aferidor
# pegou. Decodifico os escapes e exijo que nao sobre nenhuma barra invertida
# nao tratada — silencio aqui viraria hash errado publicado.
base_css = re.sub(r"\\u\{([0-9a-fA-F]+)\}", lambda x: chr(int(x.group(1), 16)), base_css)
base_css = re.sub(r"\\u([0-9a-fA-F]{4})", lambda x: chr(int(x.group(1), 16)), base_css)
for bruto, val in (("\\n", "\n"), ("\\t", "\t"), ("\\`", "`"), ("\\$", "$"), ("\\\\", "\\")):
    base_css = base_css.replace(bruto, val)
if "\\" in base_css:
    sys.exit(f"BASE_CSS ainda tem escape nao tratado · {base_css.count(chr(92))} barras")

m2 = re.search(r'"(x-dc\{display:none!important\})"', rt)
xdc_css = m2.group(1) if m2 else "x-dc{display:none!important}"

print("=== auto-afericao · extrator vs navegador ===")
ok = True
for conteudo, rotulo in ((base_css, "BASE_CSS"), (xdc_css, "x-dc"), ("", "vazio")):
    meu, dele = h(conteudo), DO_NAVEGADOR.get(len(conteudo))
    bate = meu == dele
    ok &= bate
    print(f"  {rotulo:<10} {len(conteudo):>5} b  {meu}  "
          f"{'confere' if bate else 'DIVERGE de ' + str(dele)}")
if not ok:
    sys.exit("\nABORTA · meu extrator discorda do navegador. Nao publico hash que so eu vejo.")

for c in (base_css, xdc_css, ""):
    s_estilos.add(h(c))

# ───────────────────────── PLANOS · um por modelo ─────────────────────────
# Uma politica por modelo, nao uma compartilhada: o header de cada rota cai de
# 4,6 KB para ~1 KB, e o Labs deixa de poder usar hash do Console. Mais curto e
# mais fechado pela mesma mudanca.
por_modelo = {}
for nome in PLANOS:
    sc, es, at = set(), set(), set()
    colher((MOD / nome).read_text(encoding="utf-8", errors="replace"), sc, es, at)
    por_modelo[nome] = (sc, es, at)

# Censo de destinos externos (censo_destinos.py, arquivo inteiro + ilhas
# descomprimidas): `www.w3.org` e so namespace de SVG, nao busca; `unpkg.com`
# sao os ids que o `__resources` troca por blob:; sobra o Google Fonts, que o
# PROPRIO Site linka em 2 <link>. Bloquear o que o modelo pede seria tirar.
# Nenhum `fetch()` externo, nenhum WebSocket, nenhum <iframe>, nenhuma imagem
# remota nos 5 — entao connect/frame/img ficam tao fechados quanto a politica
# de hoje, e nao mais frouxos.
COMUM = ("img-src 'self' data:; connect-src 'self'; "
         "worker-src 'none'; frame-src 'none'; object-src 'none'; "
         "base-uri 'none'; form-action 'none'; frame-ancestors 'none'; "
         "upgrade-insecure-requests")

# O Site NAO leva 'unsafe-hashes' nem hash de atributo. Medido no navegador:
# 756 atributos `style=`, ZERO mortos sem autorizar nenhum deles — o React
# monta a arvore por CSSOM (`element.style`), e a CSP nao inspeciona CSSOM, so
# `style=` literal no HTML analisado. Autorizar os 359 seria header de 20 KB
# comprando nada. Nos 4 modelos planos o atributo E literal — Labs 14 de 14
# mortos, Console 56 de 59 — e ali o hash e o que os mantem vivos.
CSP_SITE = (
    "default-src 'self'; "
    f"script-src 'strict-dynamic' 'unsafe-eval' {' '.join(sorted(s_scripts))}; "
    "style-src 'self' 'unsafe-hashes' https://fonts.googleapis.com "
    f"{' '.join(sorted(s_estilos | s_attrs_externos))}; "
    "font-src 'self' data: https://fonts.gstatic.com; " + COMUM)


HANDLERS = json.loads((pathlib.Path(__file__).parent / "handlers.json")
                      .read_text(encoding="utf-8"))


def csp_plano(sc, es, at, estilo_aberto=False, handlers=()):
    # `estilo_aberto` e SO do Console, e a razao esta no proprio modelo:
    #   L836  var SW=[['Accent',null],...]      L840  var c = x[1] || readAcc();
    #   L629  colorPicker.addEventListener('input', e=>applyAccent(e.target.value))
    # um <input type=color> produz QUALQUER hex, e o Console escreve isso em
    # `style="background:#..."`. Dominio infinito: nenhum conjunto finito de
    # hash cobre. Medido: 18 atributos mortos so com hash. Varri os 5 pela
    # classe (estilo_dinamico.py) — Site usa cssText, que e CSSOM e a CSP nao
    # inspeciona; Labs, Brandbook e Design System nao tem gerador nenhum. So
    # este modelo precisa, so para ESTILO, e o script-src dele continua
    # 'self' + hash, sem unsafe-eval e sem strict-dynamic.
    # Hash e 'unsafe-inline' se anulam: havendo hash, o navegador IGNORA o
    # 'unsafe-inline'. Por isso aqui e um ou outro, nao os dois.
    estilo = ("'self' 'unsafe-inline'" if estilo_aberto
              else "'self' 'unsafe-hashes' " + " ".join(sorted(es | at)))
    # Handler inline (`onclick=`) nao executa sob `script-src 'self'`: o botao
    # fica na tela e nao responde. Minha medicao no navegador nao pegou isso
    # porque eu media o que CARREGA, nunca o que responde a clique — quem
    # pegou foi o portao check-csp do proprio repo. CSP3 autoriza handler por
    # hash desde que a diretiva traga 'unsafe-hashes'; continua sendo o valor
    # exato do atributo, e nada alem dele.
    script = "'self' " + " ".join(sorted(sc))
    if handlers:
        script = "'self' 'unsafe-hashes' " + " ".join(sorted(set(sc) | set(handlers)))
    return ("default-src 'self'; "
            f"script-src {script.strip()}; "
            f"style-src {estilo}; "
            "font-src 'self' data:; " + COMUM)

APELIDO = {"TRIVIU-Console-V5_4_2.html": "console",
           "TRIVIU-Labs-V5.html": "labs",
           "TRIVIU-Brandbook-V3.3.html": "brand",
           "TRIVIU-Design-System-V4.2.html": "ds"}

p = pathlib.Path(__file__).parent
(p / "csp_site.txt").write_text(CSP_SITE, encoding="utf-8")
politicas = {"site": CSP_SITE}
ESTILO_ABERTO = {"TRIVIU-Console-V5_4_2.html"}
for nome, (sc, es, at) in por_modelo.items():
    c = csp_plano(sc, es, at, estilo_aberto=nome in ESTILO_ABERTO,
                  handlers=HANDLERS.get(APELIDO[nome], []))
    politicas[APELIDO[nome]] = c
    (p / f"csp_{APELIDO[nome]}.txt").write_text(c, encoding="utf-8")

print(f"\n{'politica':<10} {'chars':>8} {'script':>7} {'style':>7} "
      f"{'unsafe-inline':>14} {'unsafe-eval':>12} {'strict-dynamic':>15}")
tam = {"site": (len(s_scripts), len(s_estilos))}
for nome, (sc, es, at) in por_modelo.items():
    tam[APELIDO[nome]] = (len(sc), len(es | at))
for k, csp in politicas.items():
    ns, ne = tam[k]
    print(f"{k:<10} {len(csp):>8,} {ns:>7} {ne:>7} "
          f"{'PRESENTE' if 'unsafe-inline' in csp else 'ausente':>14} "
          f"{'presente' if 'unsafe-eval' in csp else 'ausente':>12} "
          f"{'presente' if 'strict-dynamic' in csp else 'ausente':>15}")
print(f"\nmaior header: {max(len(c) for c in politicas.values()):,} chars")
