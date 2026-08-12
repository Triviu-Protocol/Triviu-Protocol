# Laudo das quatro varreduras · Polygon PoS · 2026-08-11

**Predador:** `gaviao` · Builder · algo trading
**Por que existe:** as quatro varreduras estavam escritas e nunca tinham produzido
laudo. Rodadas contra RPC real, não contra fixture. Números abaixo, sem
arredondar para o lado bonito.

---

## O que cada uma mediu, e o que devolveu

| varredura | escopo | amostras | ciclos positivos |
|---|---|---|---|
| `multivenue-scan` | ciclo triangular entre venues | 40 blocos | **0 / 40** |
| `aggregators-scan` | grafo de 42 arestas, melhor rota por bloco | 30 blocos | **0 / 30** |
| `fee-tier-scan` | USDT/USDC.e em 5 venues, com profundidade | 30 blocos | **0 / 30** |
| `long-tail-scan` | 25 pares mais novos da QuickSwap V2 | 135.452 pares | **0** com liquidez ≥ $50k |

### O número que mais informa

O `fee-tier-scan` é o teste mais favorável que existe: **par estável contra
estável** (USDT/USDC.e), cinco venues, cotação com profundidade real via
QuoterV2, $5.000 de tamanho.

```
melhor resultado líquido observado : -5,36 bps   (-0,054% sobre $5.000)
rota do melhor                     : compra em V3[0,01%] / venda em V3[0,05%]
```

**Perde por 5,36 bps.** Não perde por muito — perde de forma consistente. É a
diferença entre "o mercado está longe" e "o mercado está fechado por pouco, e
fecha sempre".

### E o mais duro

```
aggregators : melhor P observado 0,94567768   = -543 bps
multivenue  : mediana cross-venue 0,96636101  = -336 bps
```

O ciclo de três pernas nem chega perto. Nas 40 amostras do `multivenue`, o
melhor ciclo era **cross-venue em 0 de 40 blocos** — ou seja, nem a dispersão
entre venues, que é a tese do produto, apareceu como vantagem uma única vez.

### O long-tail não fracassou — ele nem chegou a testar

Dos 25 pares mais novos, **25 são precificáveis** e **zero** passam do piso de
$50k de liquidez. O funil morre no primeiro filtro. O próprio script declara que
o Tier-2 (simulação compra→venda para rejeitar honeypot) **ainda não foi
construído**.

---

## O que este laudo NÃO diz

**Não diz que arbitragem na Polygon está morta.** Isso seria a amostra falando
pelo conjunto, e esta casa já pagou caro por essa troca. O que foi medido:

- uma janela de fim de bloco, não o intra-bloco
- 4 venues + agregadores, não todas
- 25 pares de cauda, de 135.452
- tamanhos de $5.000, não a curva de tamanho inteira

**Fronteira declarada pelos próprios scripts:** *"reservas de FIM DE BLOCO. Isto
mede a má-precificação RESIDUAL, não uma brecha capturável."* O que sobra no fim
do bloco é o que ninguém quis — os bots de intra-bloco já passaram. Medir aqui é
medir a sobra, e a sobra é negativa.

---

## Consequência operacional

**Não há rota medida que justifique um `setToken`.** Liberar a whitelist agora
abriria o protocolo para um espaço onde 100 amostras em 4 metodologias distintas
não acharam uma única passagem positiva.

Duas saídas honestas, e elas não são equivalentes:

1. **Medir onde ainda não se mediu** — intra-bloco (mempool), outras redes, curva
   de tamanho, Tier-2 do long-tail. É construir instrumento antes de abrir a
   porta.
2. **Reconhecer que a tese de taker mudou** — e é o que a casa já registrou ao
   migrar o foco para LP. O painel de LP existe, tem números positivos medidos, e
   os contratos dele **não estão implantados**.

A segunda tem produto pronto do outro lado. A primeira tem instrumento a
construir. Ambas são melhor que abrir a whitelist sem evidência.

---

*Rodado contra `lb.drpc.live` em 2026-08-11 · 4 varreduras · 100 amostras somadas ·
zero ciclos positivos · Lei #8 honrada (medição antes de proposta) · Lei #11
honrada (fronteira do método declarada junto com o resultado)*
