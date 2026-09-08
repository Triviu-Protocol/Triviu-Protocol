# Arranjos de mutação · a prova dos portões

Um portão que ninguém atacou não é portão: é um arquivo com nome de portão.
Estes arranjos **quebram a coisa guardada** e exigem que o portão fique
**vermelho**. Mutação que sobrevive = portão decorativo (LACRE · L2).

Eles viviam em `AppData\Local\Temp` até 2026-09-08. Vieram para cá porque a
razão está escrita no próprio `.vercelignore` deste repositório: *backup em
diretório temporário não é backup* — e a L1 do LACRE diz que portão vive no
**artefato**, não no terminal. O arranjo que prova o portão segue a mesma regra.

## Como rodar

```bash
python scripts/mutacao/mutacao_cem.py        # da raiz do repo
```

Cada um imprime uma linha por caso, com o esperado ao lado do que saiu, e
termina em `APROVA · mutacao N/N`. Exit != 0 quando algum caso diverge.

A cópia de trabalho nasce em `tempfile.mkdtemp()`, **fora da árvore**. Isso não é
detalhe: quando estes arquivos foram trazidos do temp para cá, a cópia passou a
nascer dentro do repositório e o `copytree` copiou a si mesmo em recursão até o
Windows recusar o caminho. Compilavam, estavam salvos, e não funcionavam — quem
pegou foi **executar**, não ler.

## O que cada um prova

| arranjo | casos | o que ele ataca |
|---|---:|---|
| `mutacao_cem.py` | 11 | o estado "100%": tirar cada porta que abri, pôr a linha antiga de volta no ar sem linkar, reabrir exceção no portão de órfãs, ressuscitar rota no sitemap, afrouxar a CSP da rota que assina |
| `mutacao_novos_portoes.py` | 17 | `check-afirmacoes` e `check-sitemap` — hash trocado, `bytes=` mentido, arquivo apagado, blob do backup sumido, e **6 casos que cegam o detector** |
| `mutacao_poda.py` | 11 | os 4 portões que passaram a podar pelo `.vercelignore`. Ataca nas **duas** direções: o defeito plantado em arquivo publicado tem de ficar vermelho, e o mesmo defeito em arquivo retido tem de continuar verde |
| `mutacao_links_doc.py` | 8 | `check-links-doc` — README anunciando rota inexistente, rota saindo do ar sem trocar o link, e a normalização de barra que a 1ª versão do portão errou |
| `mutacao_bytes.py` | 7 | `check-bytes-de-controle`, mais o ramo do `check-csp` que **nunca tinha executado** — planta um `<link>` de terceiro numa página publicada e exige que a saída nomeie a rota certa |
| `mutacao_csp_orfas.py` · `mutacao_f3.py` · `mutacao_csp.py` | 32 | as rodadas anteriores, sobre CSP, órfãs e estilo inline |

**Total nesta árvore: 86 casos.** As cinco primeiras foram reconferidas rodando
daqui em 2026-09-08: 11/11, 17/17, 11/11, 8/8, 7/7.

## Os medidores, que não são arranjos

Respondem *"como está hoje?"* e não quebram nada:

| medidor | pergunta |
|---|---|
| `triviu_100.py` | os modelos chegaram intactos? quantas rotas se alcança desde `/`? |
| `qual_linha.py` | cada página publicada serve QUAL linha de produto, e assina? |
| `onde_pertencem.py` | quem linka quem, e quantas portas bastam |
| `lpvault_hoje.py` | o cofre da linha antiga tem saldo? (lê a chain) |
| `cyber_triviu.py` | varredura do Cyber Squad sobre o que publica |
| `repo_estado.py` | o que o GitHub mostra, e o que nele está velho |
| `orfaos_antes_depois.py` | separa o órfão que uma onda CRIA do que já era |
| `site_o_que_mudou.py` | o que exatamente difere entre o modelo e o servido |
| `csp_build.py` | monta a CSP por modelo e se afere contra o navegador |
| `conferir_vercel.py` · `grafo_links.py` | rotas reais na borda · grafo de links |

`triviu_100.py`, `site_o_que_mudou.py` e `csp_build.py` leem a pasta dos
**modelos oficiais**, que não é versionada. O caminho sai de `TRIVIU_MODELOS`,
com o valor desta máquina como padrão.
