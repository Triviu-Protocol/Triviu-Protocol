<p align="center">
  <img src="brand/simbolo.svg" width="120" alt="Símbolo do Triviu: ciclo de três nós com arcos direcionais"/>
</p>

<h1 align="center">Triviu</h1>

<p align="center">🌐 <a href="README.md">Canonical English version</a></p>

<p align="center"><em>Código aberto. Matemática verificável. Nenhuma promessa.</em></p>

<p align="center">
  <code>Polygon PoS</code> · <code>AGPL-3.0</code> · <code>v0 — pré-testnet, NÃO AUDITADO</code> · <code>sem token</code>
</p>

---

> ### ⚠ AVISO DE RISCO — LEITURA OBRIGATÓRIA
> A maior parte das oportunidades de arbitragem atômica na Polygon é capturada
> por operadores profissionais. Para a maioria dos usuários individuais, o
> resultado esperado após custos de gas tende a **zero ou negativo**. O Triviu é
> **infraestrutura educacional** — não é fonte de renda. Transações revertidas
> ainda pagam gas.

## O que é

Protocolo não-custodial e de código aberto para **executar, simular e estudar
arbitragem triangular atômica** em DEXs na Polygon — acompanhado da camada
educacional que ensina qualquer pessoa a ler, auditar e rodar este código por
conta própria. Documento fundador: [`docs/triviu-litepaper-v0.1.pt-BR.md`](docs/triviu-litepaper-v0.1.pt-BR.md).

**O que o Triviu NÃO é:** não custodia fundos, não capta recursos, não emite
token, não vende sinal, não promete retorno. Se alguém oferecer qualquer uma
dessas coisas em nome do Triviu, é golpe — denuncie.

## Não confie: verifique

| O quê | Onde |
|---|---|
| Litepaper | [`docs/triviu-litepaper-v0.1.pt-BR.md`](docs/triviu-litepaper-v0.1.pt-BR.md) |
| Decisões e seus custos (trilema) | [`decisions/`](decisions/) — Fichas de Tradeoff numeradas |
| Contratos (v0, não auditados) | [`contracts/src/`](contracts/src/) |
| Endereços verificados (Polygonscan) | _a publicar no primeiro deploy em testnet_ |
| Painel público com falhas incluídas | [`dashboard/`](dashboard/) — _Dune, a publicar_ |
| Marca e regras de comunicação | [`brand/`](brand/) |

## Mapa do repositório

```
contracts/   Executor atômico + ParameterRegistry (Foundry)
engine/      Motor off-chain: grafo de pools, Bellman–Ford, simulação (TypeScript)
sim/         Como rodar tudo em fork local da Polygon — comece AQUI
decisions/   Fichas de Tradeoff: toda decisão declara o que ganha e o que custa
docs/        Litepaper e documentação
brand/       Símbolo, tokens de design e manual (CC BY 4.0)
dashboard/   Queries do painel público (falhas incluídas, sempre)
```

## Começando — sempre pelo fork

O caminho oficial é **fork local → testnet (Amoy) → auditoria → mainnet**, e
esta ordem não é sugestão:

```bash
# 1. Fork local da Polygon (errar aqui é grátis)
anvil --fork-url $POLYGON_RPC

# 2. Contratos
cd contracts && forge build && forge test

# 3. Motor (dry_run=true por padrão — ele NÃO envia transações)
cd ../engine && npm install && cp config/params.example.toml config/params.toml
npm run dev
```

Guia completo em [`sim/README.md`](sim/README.md).

## Como mudar um parâmetro

1. Abra uma issue com o template **Proposta de parâmetro** (inclui o eixo do
   trilema afetado e o custo assumido).
2. PR alterando `engine/config/` após discussão pública.
3. Merge — o espelho on-chain é atualizado no `ParameterRegistry`, e o evento
   grava **a URL do PR**: a trilha fórum → Git → bloco fica completa.

## Princípios (litepaper §2)

Não-custódia absoluta · código aberto · transparência radical · **sem
promessas** · **sem token** · educação antes de execução · IA rotulada.
E, estruturando tudo, o trilema: *o Triviu não resolve o trilema — ele o
percorre e documenta o preço de cada volta* ([`decisions/0001`](decisions/0001-polygon-pos.pt-BR.md)).

## Licenças

Código: **AGPL-3.0** ([LICENSE](LICENSE)) · Marca e manual: **CC BY 4.0**
([brand/](brand/)) · Docs: CC BY-SA 4.0. Contribuições: [CONTRIBUTING.md](CONTRIBUTING.md) ·
Vulnerabilidades: [SECURITY.md](SECURITY.md).
