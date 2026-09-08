"""
Mutacao da CSP por hash · a politica recusa mesmo, ou e enfeite?

Um portao so vale se, quando eu planto o defeito, ele fecha. E se, quando eu
NAO planto nada, ele fica calado — controle mudo, senao o vermelho nao
significa nada.

  /?alvo=site|labs&mut=nenhum|script|estilo|attr&csp=1|0

  mut=script  · <script>window.__MUT=1</script> plantado no <head>
  mut=estilo  · <style> novo, conteudo que nenhum hash autoriza
  mut=attr    · style= novo no <body>, valor que nenhum hash autoriza
  mut=nenhum  · CONTROLE · byte identico ao modelo

csp=1 aplica a politica real da rota; csp=0 nao manda header nenhum. A mesma
mutacao tem de PASSAR sem politica e MORRER com politica — senao o que eu
medi foi outra coisa.
"""

# ---------------------------------------------------------------------------
# Portado do diretorio temporario para o repositorio em 2026-09-08.
# Motivo, escrito por mim mesmo no .vercelignore no dia anterior: backup em
# diretorio temporario nao e backup. A L1 do LACRE diz que portao vive no
# artefato; o arranjo que PROVA o portao segue a mesma regra.
# A raiz deixou de ser caminho desta maquina e passa a sair do proprio arquivo.
# ---------------------------------------------------------------------------

import http.server
import json
import pathlib
import socketserver
import sys
import urllib.parse

# A raiz sai do PROPRIO arquivo, e nao do caminho desta maquina: o arranjo
# tem de rodar a partir de qualquer clone, senao ele documenta em vez de provar.
RAIZ = pathlib.Path(__file__).resolve().parents[2]


SCR = pathlib.Path(__file__).parent
SITE = pathlib.Path(RAIZ / r"site")
CSP_SITE = (SCR / "csp_site.txt").read_text(encoding="utf-8").strip()
CSP_PLANOS = (SCR / "csp_planos.txt").read_text(encoding="utf-8").strip()

ALVOS = {"site": ("index.html", CSP_SITE), "labs": ("TRIVIU-Labs-V5.html", CSP_PLANOS)}

MUTS = {
    "nenhum": lambda h: h,
    "script": lambda h: h.replace("<head>", "<head><script>window.__MUT=1;</script>", 1),
    "estilo": lambda h: h.replace("<head>", "<head><style>body{outline:7px dashed magenta}</style>", 1),
    "attr": lambda h: h.replace("<body", '<body style="outline:9px dotted lime"', 1),
}


class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        alvo = q.get("alvo", ["site"])[0]
        mut = q.get("mut", ["nenhum"])[0]
        usa_csp = q.get("csp", ["1"])[0] == "1"
        if alvo not in ALVOS or mut not in MUTS:
            self.send_error(404)
            return
        arq, csp = ALVOS[alvo]
        html = (SITE / arq).read_text(encoding="utf-8", errors="replace")
        antes = len(html)
        html = MUTS[mut](html)
        if mut != "nenhum" and len(html) == antes:
            self.send_error(500, "mutacao nao aplicou")
            return
        b = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        if usa_csp:
            self.send_header("Content-Security-Policy", csp)
        self.send_header("X-Mut", f"{alvo}/{mut}/csp={int(usa_csp)}/delta={len(html)-antes}")
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *a):
        pass


PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8912
socketserver.TCPServer.allow_reuse_address = True
print(f"mutacao em {PORTA}")
socketserver.TCPServer(("127.0.0.1", PORTA), H).serve_forever()
