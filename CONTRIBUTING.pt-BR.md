# Contribuindo com o Triviu

O fluxo é o mesmo para código, parâmetros, docs e marca:
**fórum/issue → pull request → discussão pública → merge → (se on-chain) atualização via timelock.**
O histórico do Git é o registro oficial de tudo.

## Regras

1. **Decisões de arquitetura exigem Ficha de Tradeoff.** Use `decisions/TEMPLATE.md`.
   Ficha sem linha de custo é inválida — se nada custou, nada foi decidido.
2. **Parâmetros** (rotas, tokens, tetos de slippage, `minProfit`) mudam por PR no
   diretório `engine/config/` + issue com o template "Proposta de parâmetro".
   O espelhamento on-chain no `ParameterRegistry` referencia a URL do PR no evento.
3. **Docs e peças públicas** passam pelo checklist do Manual da Marca (§ 9.4):
   zero promessa de ganho, aviso de risco onde houver execução, selo de IA em
   conteúdo sintético, nenhuma alegação de "trilema resolvido".
4. **Commits**: mensagens no imperativo, escopo curto (`contracts:`, `engine:`,
   `docs:`, `brand:`, `decisions:`). Releases são assinadas (GPG).
5. **Conduta**: respeito técnico; discutimos ideias, não pessoas.

## Antes de abrir PR de código

- `forge build && forge test` em `contracts/`
- `npm run typecheck` em `engine/`
- Tudo que toca execução deve rodar primeiro em fork local (`sim/`).
