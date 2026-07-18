# Política de Segurança

**Estado atual: v0 — NÃO AUDITADO. Uso apenas em fork local e testnet.**
Nenhum deploy em mainnet antes de auditoria externa (marco da v0.2 no litepaper).

## Divulgação responsável

Encontrou uma vulnerabilidade? Não abra issue pública.
Escreva para: security@triviu.org (placeholder — configurar antes do lançamento),
com passos de reprodução. Respondemos em até 72h e coordenamos a correção e a
divulgação pública com crédito ao pesquisador.

Programa de recompensas: **a definir**. Coerentes com o princípio 4, não
prometemos valores antes de existirem fundos e regras publicadas.

## Escopo

- `contracts/` (Executor, Registry)
- `engine/` (apenas falhas que induzam perda de fundos do operador)

Fora de escopo: RPCs de terceiros, front-ends de forks, engenharia social.
