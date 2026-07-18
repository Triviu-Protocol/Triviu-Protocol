# Ficha de Tradeoff Nº 0002 — Checagem stateless estrita vs. griefing por doação

- **Data:** julho de 2026
- **Status:** aceita para a v0 · contabilidade por delta de saldo agendada para a v0.2
- **PR de origem:** onda da suíte de testes (achado ao escrever a suíte §08.3)

## Decisão

A v0 mantém a checagem stateless estrita (`startBalance != 0 → revert
NotStateless`), aceitando um vetor de griefing conhecido; a v0.2 a substitui
por contabilidade por delta de saldo antes de qualquer deploy em mainnet.

## O achado, em termos simples

Qualquer pessoa pode transferir 1 wei de um token da whitelist diretamente
para o executor. A partir daí, todo `executeCycle` daquele token reverte com
`NotStateless` — permanentemente, porque a v0 não tem função de resgate.
Custo do ataque: poeira mais gas. Efeito: negação de serviço por token. O
comportamento está pinado por `test_KnownLimitation_DonationTripsStatelessCheck`.

## Leitura pelo trilema

| Eixo | Veredito | Justificativa e mitigação |
|---|---|---|
| Segurança | **GANHA** | A checagem estrita torna a não-custódia trivialmente auditável: saldo zero antes e depois, sem contabilidade para confiar. |
| Escalabilidade | **MANTÉM** | Uma chamada extra de `balanceOf`; gas irrelevante nos dois desenhos. |
| Descentralização | **CUSTA** | A disponibilidade depende de ninguém atacar o contrato — um ator externo pode parar os ciclos de um token a custo de poeira. Mitigação: escopo fork/testnet na v0, delta de saldo na v0.2, e redeploy é barato para um contrato stateless. |

## Alternativas consideradas

Delta de saldo já na v0 (rejeitada: altera o artefato fundador no meio da onda
e merece PR própria auditada); função de resgate (rejeitada: uma saída
controlada pelo owner enfraquece a história de não-custódia e cria superfície
de ataque).

## Consequências

Superfície educacional: esta ficha é material de ensino sobre por que
"stateless" não é de graça. O `executeCycle` da v0.2 vai computar lucro como
`finalBalance − startBalance` e devolver exatamente esse delta, tornando
doações irrelevantes. Até lá, a limitação é publicada documentada no header
do contrato, na suíte de testes e nesta ficha — falhas incluídas.
