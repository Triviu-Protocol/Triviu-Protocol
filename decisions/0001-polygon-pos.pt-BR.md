# Ficha de Tradeoff Nº 0001 — Rede de execução: Polygon PoS

- **Data:** julho de 2026
- **Status:** aceita (decisão fundadora)
- **PR de origem:** fundação do repositório

## Decisão

O Triviu executa e ensina sobre a Polygon PoS.

## Leitura pelo trilema

| Eixo | Veredito | Justificativa e mitigação |
|---|---|---|
| Escalabilidade | **GANHA** | Gas baixo torna ciclos pequenos executáveis e errar fica barato — pré-requisito de educação prática em DeFi. |
| Segurança | **MANTÉM** | Atomicidade elimina exposição de perna: ou o ciclo fecha, ou tudo reverte. Risco de contrato permanece — auditoria externa antes da v1. |
| Descentralização | **CUSTA** | Herdamos o conjunto de validadores da Polygon. Mitigação: contratos verificados, simulação local em fork, recomendação de RPC próprio. |

## Alternativas consideradas

Ethereum L1 (gas proibitivo para educação prática); Arbitrum/Base (candidatas
válidas para expansão — exigirão fichas próprias); side-chains menores
(custo de segurança e liquidez inaceitável).

## Consequências

Toda a documentação, o motor e o simulador assumem Polygon como padrão;
leitura do diagrama de trilema desta escolha: E 0,9 · S 0,8 · D 0,55.
