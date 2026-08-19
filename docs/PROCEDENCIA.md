# Como provar que o código aqui é o que está na chain

Este repositório hospeda contratos que estão vivos na Polygon e movem dinheiro de
terceiros. A capa dele diz *"Open source. Verifiable math."* Este documento é o
procedimento que torna essa frase executável por qualquer pessoa, sem confiar em
nós.

## O caminho forte · reprodução do bytecode

```bash
git clone --recursive https://github.com/Triviu-Protocol/Triviu-Protocol
cd Triviu-Protocol/contracts
forge build
```

`foundry.toml` fixa `solc = "0.8.24"`, `optimizer = true`, `optimizer_runs = 200`.
Compile e compare o `deployedBytecode` do artefato com o que a chain devolve:

```bash
cast code 0xac89E63F4F7d26A5CefDc6bA5a13d8F507A7EF1D --rpc-url https://polygon-bor-rpc.publicnode.com
# TriviuRegistry

cast code 0x862fD93E6106F07D9395FF14fFE6d828994e8Ee8 --rpc-url https://polygon-bor-rpc.publicnode.com
# TriviuFactory
```

Medido em 2026-08-19, em dois endpoints independentes que concordaram byte a byte:

```
TriviuRegistry    1.900 bytes    80 bytes divergentes
TriviuFactory    13.930 bytes    60 bytes divergentes
```

**Todos os divergentes caem dentro das janelas de `immutable`** — confira contra
`deployedBytecode.immutableReferences` no artefato. Zero divergência fora. Os
immutables se cruzam: o Registry carrega o endereço da Factory e vice-versa.

**O que este caminho prova, e é o mais forte disponível:** a reprodução bate
inclusive o hash IPFS do metadata embutido no fim do bytecode, e esse hash cobre
o **fonte** e as **opções de compilação**. Se qualquer um dos dois divergisse, o
metadata divergiria.

## O caminho fraco, e por que ele não basta sozinho

Os artefatos em `contracts/out/*.json` registram o `keccak256` de cada fonte que
entrou na compilação, e comparar o fonte do repositório contra esse registro é
rápido:

```bash
# a partir da raiz do repositorio
cd contracts
python -c "import json;print(json.load(open('out/TriviuFactory.sol/TriviuFactory.json'))['metadata']['sources']['src/TriviuCerca.sol']['keccak256'])"
```

**Mas `contracts/out/` está no `.gitignore`.** Quem clona não recebe esses
artefatos, e um hash conferido contra um arquivo local que só nós temos não prova
nada a terceiro. **Use este caminho para detectar deriva depressa; use o de cima
para provar.**

Esta distinção foi apontada pelo Tubarão-branco em auditoria de água limpa, em
2026-08-19: a prova entregue era mais fraca que a verdade, e o caminho que a
ancora não estava escrito em lugar nenhum.

## O byte tem de sobreviver ao clone

`.gitattributes` marca `*.sol -text`. Sem isso, um clone em Windows com
`core.autocrlf=true` converte os fins de linha e **o hash do fonte deixa de
bater**. Medido:

```
contracts/src/TriviuCerca.sol   commitado  28.658 bytes   0x0e52d5aa…
                                sem -text  29.238 bytes   0x3ca9b937…   (580 conversões)
```

A mesma armadilha vale para `site/vendor/three-r128.min.js`, cujo sha512 está
fixado na tabela `VENDOR` de `scripts/check-csp.mjs`. **Correção:** a primeira
redação desta página dizia que a página publica `integrity=` e que o navegador
recusaria o script. Medido: há **zero** `integrity=` sob `site/`; o arquivo é
carregado por `<script src>` de mesma origem. Quem reprova a deriva é o portão,
não o navegador — em CI e no hook, alto. Afirmação sem lastro, corrigida aqui.

## O que este documento NÃO afirma

- **Não afirma que os contratos estão auditados.** O laudo D2 (Náutilo) foi selado
  no commit `8e7288b` do repositório `triviu-engine`, e há **+520/−34 linhas em 5
  arquivos depois do selo**. O código auditado não é este.
- **Não afirma que o Slither os cobriu.** Até 2026-08-19 o job rodava sobre
  `contracts/`, onde **quatro dos oito** `.sol` não estavam commitados — o número
  que esta própria onda corrigiu, e que a primeira redação desta página repetiu
  errado como "três dos sete". A partir deste
  commit ele os vê; o resultado é da esteira, não desta página.
- **Não afirma independência de auditoria.** Os laudos em `docs/audits/` foram
  produzidos pela mesma casa que construiu o produto.

Reprodução é uma coisa; auditoria é outra. Este documento entrega a primeira.
