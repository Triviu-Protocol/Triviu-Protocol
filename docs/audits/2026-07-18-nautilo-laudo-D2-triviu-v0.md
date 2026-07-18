# Laudo de Auditoria de Smart Contract — Triviu v0

**Produto:** Audit-as-a-Service D2 · Predators Protocol
**Predador-produto responsável pelo laudo:** Náutilo (Web3 · emissão e selagem)
**Detecção técnica on-chain:** Medusa (Web3 · detecção de vulnerabilidade)
**Juiz de fechamento:** Tubarão-branco (Lei do Sangue · veredito N2)

---

> ### FRONTEIRA DO LAUDO — LEITURA OBRIGATÓRIA (hardcoded)
> Este é um **laudo técnico de código de smart contract**. Ele **não constitui
> parecer jurídico nem auditoria contábil regulada**; **nenhuma auditoria garante
> ausência de vulnerabilidades**; **a asseguração e a responsabilidade finais são
> de quem assina o deploy**. O laudo cobre exclusivamente o código no escopo e no
> commit declarados abaixo — não se estende a código modificado depois.

---

## 1. Identificação

| Campo | Valor |
|---|---|
| Cliente | Triviu (dogfooding — auditoria do próprio protocolo) |
| Objeto | `contracts/src/TriviuExecutor.sol` · `contracts/src/ParameterRegistry.sol` |
| Commit auditado | `86cf80e` (branch `main`) |
| Chain-alvo | Polygon PoS (execução) · Amoy (testnet) |
| Solidity | `^0.8.24` · Foundry (forge 1.5.1) |
| Tier do produto | **Primeira-passada / gate** (TVL em produção = 0 · pré-testnet) |
| Idioma | PT-BR (canônico do produto) |
| Data | 2026-07-18 |

**Posicionamento do tier (Art. 3):** este laudo é de **primeira-passada** — um
gate de qualidade antes de testnet. Ele **não** é selo único para alto TVL. Para
mainnet com valor real em risco, a estratificação recomendada é laudo +
**auditoria externa de firma** + bug bounty, exatamente como o litepaper §10 já
exige. Este laudo não substitui essa etapa; ele a antecede.

## 2. Escopo examinado (o que foi olhado — Art. 6)

| Frente | Método | Cobertura |
|---|---|---|
| Revisão manual linha a linha | leitura integral dos 2 contratos | completa |
| Testes de unidade e reversão | `forge test` — 19 testes | 19/19 verdes |
| Invariante de propriedade | `invariant_ContractBalanceAlwaysZero` | 256 execuções × 500 chamadas · 0 violações |
| Fuzz | `testFuzz_PrincipalAndMinProfit`, `testFuzz_StepCount` | 256 execuções cada |
| Análise de reentrância | manual (CEI + superfície de chamada externa) | ver M-02 |
| Controle de acesso | manual (modelo de owner) | ver §5 |
| Lint estático | lints do `forge build` | 2 avisos informativos (I-01) |

**Não executado nesta passada (declarado, não escondido):** Slither, Mythril,
Echidna (indisponíveis neste ambiente). Ausência de ferramenta é limitação do
laudo, não atestado de limpeza. Ficam agendados para a onda de endurecimento de
CI e para a auditoria externa.

## 3. Achados por severidade

Escala: `CRITICAL · HIGH · MEDIUM · LOW · INFO` (espelha a Medusa). Severidade é
binária — mesma evidência, mesma classificação. Cada achado abaixo foi
**verificado** antes de entrar no laudo (falso-positivo morre na verificação).

### CRITICAL — nenhum achado nas categorias examinadas
### HIGH — nenhum achado nas categorias examinadas

### MEDIUM

**M-01 · Griefing por doação trava a checagem stateless**
O `executeCycle` reverte com `NotStateless` se o contrato tiver saldo na
entrada. Qualquer pessoa pode transferir 1 wei de um token da whitelist direto
ao contrato e travar permanentemente os ciclos daquele token (não há função de
resgate na v0). Custo do ataque: poeira + gas. Impacto: negação de serviço **por
token** — sem perda de fundos (a não-custódia se mantém).
- Evidência: pinado pelo teste `test_KnownLimitation_DonationTripsStatelessCheck`
  (verificado presente no código auditado).
- Decisão registrada: `decisions/0002-donation-griefing.md`.
- Correção (v0.2, antes de mainnet): contabilidade por delta de saldo
  (`finalBalance − startBalance`), que elimina o vetor na fonte.
- Situação: **não bloqueia testnet · gate obrigatório para mainnet.**

**M-02 · Calldata arbitrária a alvos da whitelist**
Cada `Step` carrega `bytes data` executada via `target.call(...)` contra
qualquer alvo permitido no Registry. A segurança depende inteiramente da
curadoria da whitelist. Como o contrato não retém saldo e a aprovação é montada
por ciclo para o `amountIn` exato, o raio de dano fica limitado ao principal da
transação em curso — não atinge outros usuários nem fundos armazenados.
- Evidência: documentado no header do contrato e no litepaper §4.1.
- Correção (v0.2): adaptadores de swap tipados por DEX + approve-exato-e-reset
  por perna.
- Situação: **aceitável na v0 com whitelist curada (só routers) · endurecer na v0.2.**

### LOW

**L-01 · Retorno não-padrão de ERC-20**
O contrato checa o retorno booleano de `transfer`/`transferFrom` via `require`
(verificado na linha 115 do contrato auditado — correto para WMATIC/USDC/USDC.e/
WETH na Polygon). Tokens que não retornam valor reverteriam na decodificação, não
passariam em silêncio. A whitelist é o controle.
- Recomendação: incluir item de conformidade ERC-20 na política de whitelist;
  considerar `SafeERC20` na v0.2 se algum token não-padrão for candidato.

### INFO

**I-01 · Avisos de lint (`forge`)**
`erc20-unchecked-transfer` é **falso-positivo** — os dois transfers estão
envolvidos em `require(...)`; o linter não reconhece o wrapping.
`unsafe-typecast` fica no `script/Deploy.s.sol` (`uint16`) e está **guardado** por
`require(maxSlippageBps <= type(uint16).max)`. Sem alteração de código; documentado
para que os avisos não sejam lidos como não-examinados.

## 4. Observações positivas (examinadas e confirmadas)

- **Invariante stateless provada**: o executor nunca retém saldo entre transações
  — 128.000 chamadas, 0 violações. A não-custódia é verificável por máquina, não
  retórica.
- **Condição do ciclo é on-chain e não-discricionária**:
  `finalBalance ≥ principal + minProfit` reverte tudo — nenhuma perna fica exposta
  (litepaper §3).
- **Superfície mínima**: sem `delegatecall`, `selfdestruct`, `receive`/`fallback`
  ou assembly no executor (grep verificado · zero ocorrências).
- **Proveniência do Registry**: toda mudança de parâmetro exige URL de PR por
  construção (`withPr`), com evento — trilha fórum→Git→bloco.

## 5. Controle de acesso

`ParameterRegistry` é single-owner; todo mutador é `onlyOwner` + `prUrl`
não-vazio. O `owner` nasce como o deployer e deve migrar para multisig com
timelock antes de mainnet (litepaper §4.2). O `TriviuExecutor` **não tem owner,
admin, pause ou upgrade** — não há o que sequestrar. Correto para um desenho
stateless.

## 6. Conclusão do laudo (Art. 6 — anti-claim)

**Nenhum achado CRITICAL ou HIGH nas categorias examinadas.** Dois achados
MEDIUM (M-01, M-02) são limitações inerentes e declaradas da v0, documentadas,
testadas e com correção agendada para a v0.2 — são gates de mainnet, não defeitos
desta entrega.

Este laudo **não conclui que "o contrato é seguro"**. Ele conclui que, nas
categorias e no commit examinados, com as ferramentas efetivamente executadas, os
achados são os listados acima — e que a asseguração final é de quem assina o
deploy. Coerente com o Tubarão-branco (veredito N2 · APROVA_PERFEITO para escopo
fork/testnet · mainnet vetado por construção até M-01/M-02 fechados + auditoria
externa).

**Selo de escopo:** válido para o commit `86cf80e`. Código modificado depois =
novo laudo (a concha não se re-sela sozinha).

---

## Fronteira entre os documentos deste diretório (quem faz o quê no canon)

| Documento | Predador | O que É | O que NÃO É |
|---|---|---|---|
| [Detecção on-chain](2026-07-18-medusa-triviu-v0.md) | Medusa | Detecção técnica de vulnerabilidade (input) | Não é o produto-face |
| **Este laudo D2** | **Náutilo** | **Laudo-produto selado, por severidade, sob fronteira** | Não é parecer jurídico nem contábil |
| [Mapa de risco regulatório](2026-07-18-crocodilo-legal-triviu-v0.md) | Crocodilo | Mapa interno de superfície de risco legal | **Não é parecer jurídico** (privativo OAB · Lei 8.906/94) — não substitui advogado |
| [Veredito N2](2026-07-18-tubarao-branco-n2-verdict.md) | Tubarão-branco | Juiz final · ratifica as auditorias N1 | Não é execução de deploy |

*Disclaimer de fronteira (repetido por obrigação canônica): laudo técnico de
código; não constitui parecer jurídico nem auditoria contábil regulada; nenhuma
auditoria garante ausência de vulnerabilidades; a asseguração é de quem assina o
deploy.*
