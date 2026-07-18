# Triviu

**Protocolo aberto de arbitragem atômica e infraestrutura educacional em DeFi**

Litepaper v0.1 — Julho de 2026
Rede: Polygon PoS · Licença de código: AGPL-3.0 · Autoria: Triviu Contributors
*Tradução. Versão canônica em inglês: [triviu-litepaper-v0.1.md](triviu-litepaper-v0.1.md)*

---

## Resumo

Triviu é um protocolo não-custodial e de código aberto para execução de arbitragem triangular atômica em exchanges descentralizadas (DEXs) na rede Polygon, acompanhado de uma camada educacional que ensina qualquer pessoa a ler, auditar, simular e executar o código por conta própria. O protocolo não custodia fundos de terceiros, não capta recursos, não emite token e não promete retorno. Sua única proposta é tecnologia verificável: contratos verificados on-chain, parâmetros públicos versionados em Git, documentação espelhada em IPFS e dados de execução abertos. Assim como o Bitcoin propôs transações eletrônicas sem depender de confiança em intermediários, o Triviu propõe capacitação em DeFi sem depender de confiança em promessas: apenas código, matemática e evidência on-chain.

---

## 1. Motivação

O ecossistema DeFi está saturado de "robôs de lucro" vendidos como caixas-pretas: código fechado, resultados não verificáveis e marketing baseado em expectativa de renda. O usuário é convidado a confiar exatamente onde deveria poder verificar.

A lição central do Bitcoin foi a inversão desse modelo: *don't trust, verify*. Satoshi Nakamoto não vendeu acesso a um sistema — publicou um paper e um código funcionando, e deixou que qualquer pessoa verificasse cada afirmação.

O Triviu aplica esse princípio a um domínio específico: a arbitragem triangular em DEXs. Em vez de vender acesso a uma caixa-preta, publicamos a caixa aberta — o contrato, o motor, o simulador, os parâmetros e, com igual destaque, as limitações econômicas reais dessa estratégia.

## 2. Princípios

1. **Não-custódia absoluta.** O protocolo nunca detém fundos de terceiros. Toda execução ocorre dentro de uma única transação, com principal e resultado retornando ao chamador.
2. **Código aberto.** Repositório público sob AGPL-3.0, releases assinadas, CI aberta.
3. **Transparência radical.** Contratos verificados, painel público de execuções (incluindo falhas), parâmetros com histórico completo em Git.
4. **Sem promessas.** Nenhuma projeção de retorno, em nenhum material. Possibilidade não é probabilidade — e a Seção 6 documenta por quê.
5. **Sem token.** O Triviu não possui token, pré-venda, alocação ou programa de rendimento, e não há planos nesse sentido.
6. **Educação antes de execução.** O caminho padrão do usuário passa por fork local e testnet antes de qualquer transação em mainnet.
7. **IA rotulada.** Todo conteúdo apresentado por persona sintética é identificado como produzido por IA, em cada canal e em cada peça.

## 3. Arbitragem triangular

Uma arbitragem triangular explora discrepâncias momentâneas de preço entre três pools de liquidez, percorrendo o ciclo A → B → C → A dentro de **uma única transação atômica**. Se, ao final do ciclo, a quantidade obtida de A não superar a quantidade inicial mais custos, a transação reverte integralmente — nenhuma perna fica exposta.

Para um volume inicial `V` no ativo A, taxas de câmbio efetivas `r₁, r₂, r₃` (já refletindo impacto de preço) e fees de pool `φ₁, φ₂, φ₃`:

```
Lucro bruto = V · [ r₁·r₂·r₃ · (1−φ₁)(1−φ₂)(1−φ₃) − 1 ]

Condição de execução: Lucro bruto − G ≥ minProfit
```

onde `G` é o custo de gas denominado em A. Se a condição não for satisfeita no momento da execução, o contrato reverte.

A detecção de oportunidades equivale à busca de ciclos negativos no grafo de `−log(preço)` entre pares — um problema clássico resolvível com Bellman–Ford — implementada no motor off-chain de código aberto.

## 4. Arquitetura

### 4.1 Contrato Executor (on-chain)

Contrato *stateless* e verificado. Recebe a rota como calldata, obtém o capital do próprio chamador (ou via flashloan), executa as três pernas, aplica a verificação de `minProfit` e devolve principal e resultado ao chamador na mesma transação. Não mantém saldos entre transações e não possui função de depósito. Não existe, em nenhum ponto do sistema, custódia de fundos de terceiros.

### 4.2 Registry de Parâmetros (on-chain)

Armazena, com versionamento, as listas de rotas e tokens habilitados, tetos de slippage e valores padrão de `minProfit`. Alterações passam por multisig com *timelock*, e cada mudança on-chain espelha um pull request público previamente discutido. O histórico completo de parâmetros vive no Git.

### 4.3 Flashloans (opcional)

Integração com provedores estabelecidos na Polygon (Aave v3, Balancer Vault) permite execução sem capital próprio imobilizado. O gas continua sendo pago pelo chamador: se o ciclo não for lucrativo, a transação reverte e apenas o gas é perdido.

### 4.4 Motor off-chain (open source)

Monitora pools via multicall/websocket, detecta ciclos, **simula cada rota em fork local da Polygon (Foundry/Anvil) antes de qualquer submissão** e envia transações assinadas pela chave do próprio usuário, que nunca sai da máquina dele.

### 4.5 Simulador e backtester

Ambiente reproduzível de fork e replay histórico, permitindo que qualquer pessoa verifique — com dados públicos — o comportamento real da estratégia antes de gastar um único centavo de gas.

## 5. Transparência operacional

- Contratos verificados no Polygonscan.
- Painel público (Dune) com todas as execuções, agregados e taxa de falha — falhas incluídas, não escondidas.
- Documentação no site com espelho em IPFS; releases assinadas; CI pública.
- Fluxo de parâmetros: PR público → discussão aberta → merge → atualização on-chain via timelock. Trilha de auditoria completa, do fórum ao bloco.

## 6. Riscos e limites econômicos — leitura obrigatória

Esta seção é parte da identidade do protocolo. Qualquer distribuição do Triviu que a omita viola o espírito do projeto.

**Competição profissional (MEV).** A maior parte das oportunidades de arbitragem atômica na Polygon é capturada por *searchers* profissionais, com infraestrutura dedicada, latência mínima e integrações no nível da produção de blocos (por exemplo, via FastLane). Um operador individual com hardware comum chega, na maioria dos casos, depois — dentro do mesmo bloco.

**Expectativa realista.** Para a maioria dos operadores individuais, o resultado esperado após custos de gas tende a zero ou negativo. O Triviu é infraestrutura educacional e técnica — não uma fonte de renda, e não deve ser apresentado como tal por ninguém, inclusive por nós.

**Gas e reverts.** Transações revertidas ainda pagam gas. A atomicidade elimina exposição de mercado, não elimina custo.

**Risco de tokens.** Tokens com taxa de transferência, honeypots e liquidez manipulada existem. A whitelist do Registry mitiga, mas não elimina.

**Risco de contrato.** Auditorias externas reduzem risco; nenhuma auditoria o zera.

**Risco de infraestrutura.** RPCs e provedores de dados são pontos de confiança externos ao protocolo; o usuário deve preferir nós próprios ou provedores redundantes.

## 7. Educação e a persona de IA

Todo o conteúdo educacional do Triviu é apresentado por uma persona sintética, identificada como IA na biografia de cada canal e em cada vídeo ou publicação. O currículo é público e segue quatro pilares: (1) AMMs e pools a partir do zero; (2) anatomia de uma arbitragem triangular real, com números — gas, slippage, competição; (3) "rode você mesmo", lendo e executando o código em fork e testnet; (4) segurança de carteira e alfabetização em MEV.

Regra editorial inegociável: mostrar tecnologia, nunca renda. Nenhum material do Triviu exibe projeções de lucro, capturas de ganhos ou linguagem de enriquecimento.

## 8. Sustentabilidade

O projeto se financia por grants de ecossistema (Polygon e afins), doações on-chain a um endereço público e serviços técnicos B2B (integração e consultoria). Não há sinais pagos, grupos premium, gestão de capital de terceiros nem qualquer produto que dependa de depósitos de usuários.

## 9. Governança

**Fase 1:** mantenedores fundadores, com Registry sob multisig e timelock públicos. **Fase 2:** conselho de contribuidores definido por mérito verificável (histórico de PRs aceitos). Não há token de governança, e decisões continuam auditáveis pelo mesmo fluxo: fórum → PR → merge → on-chain.

## 10. Roadmap

- **v0** — este litepaper, repositório público, simulador em fork e execução em testnet.
- **v0.2** — Executor auditado em mainnet com whitelist mínima; painel público de execuções.
- **v1** — Registry com timelock ativo, currículo educacional completo, segunda auditoria externa.

Coerente com o princípio 4: o roadmap é declaração de intenção, não compromisso de prazo.

## 11. Conclusão

Propusemos uma infraestrutura de arbitragem e de educação que não depende de confiança: cada regra é pública, cada execução é verificável, cada parâmetro tem histórico e cada limitação está documentada com o mesmo destaque que cada capacidade. O que o Triviu oferece não é um resultado — é a capacidade de verificar.

---

## Nota sobre o nome

*Triviu* deriva do latim **trivium** — o encontro de três vias, e também o currículo clássico que fundava toda a educação (gramática, lógica e retórica). Três rotas em um ciclo; educação como fundação. O nome é o projeto.

---

## Aviso

Este documento tem natureza técnica e educacional. Não constitui oferta de investimento, valor mobiliário, solicitação de recursos, recomendação financeira ou promessa de retorno. O uso do software é regido pela licença AGPL-3.0 e ocorre por conta e risco exclusivos de quem o executa, observada a legislação da jurisdição do usuário.
