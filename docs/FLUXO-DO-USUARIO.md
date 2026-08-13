# O fluxo do usuário, passo a passo

Da carteira desconectada até a taxa cair na tesouraria. Cada passo diz **quem
assina**, **qual função é chamada**, **o que existe on-chain hoje** e **o que
ainda não existe**.

Assinaturas lidas do código-fonte, endereços medidos contra a chain 137.
Nada aqui é aproximação de memória.

---

## Duas trilhas, e elas são independentes

| | **LP** | **Ciclo (tríade)** |
|---|---|---|
| o que o usuário possui | uma posição Uniswap V3, NFT no nome dele | um cofre próprio, `TriviuVault`, dono ele |
| o que é compartilhado | o roteador `TriviuLPVault` | o `TriviuExecutor` |
| contratos que ele implanta | **nenhum** | `TriviuVault` + `TriviuCerca` |
| custo de deploy | zero | gás de criação de dois contratos |
| **funciona hoje** | **sim** | **não — falta a `TriviuRegistry` e a `TriviuFactory` na chain** |

A trilha LP é a estratégia default porque é a única com resultado medido, e
porque ela **não depende de nada que falte implantar**.

---

# TRILHA A · LP — operável hoje

## Passo 1 · Conectar

**Quem assina:** ninguém. Conectar não é transação.

```
eth_requestAccounts   → endereço do usuário
eth_chainId           → tem de ser 0x89 (Polygon, 137)
```

Se a chain não for 137, a página **recusa e pede que ele troque**. Ela não troca
por ele: página que troca a rede sozinha é página que decide onde você assina.

**Custo:** zero.

## Passo 2 · Escolher o par e o tamanho

**Quem assina:** ninguém ainda.

O console lê do `ParameterRegistry` (`0x1Adab61e…`) quais tokens estão liberados
e mostra só esses. Hoje são **oito**, medidos:

```
USDC.e · USDC · USDT · DAI · WETH · WBTC · WPOL · LINK
```

O oráculo entra aqui: ele grava `data/decisao.json` com o par, a faixa e o
tamanho que os pools medidos sustentam. O console **pré-preenche** com isso e o
usuário **pode mudar tudo**. A decisão é dele; o sinal é sugestão com número ao
lado.

## Passo 3 · Aprovar os dois tokens

**Quem assina:** o usuário. **Duas transações.**

```
token0.approve(0xC52BaD28…, amount0Desired)
token1.approve(0xC52BaD28…, amount1Desired)
```

**Valor exato, nunca ilimitado.** Se ele já carrega aprovação ilimitada de antes,
a tela mostra o número e oferece zerar primeiro.

**Custo:** gás de duas transações, e as duas **não** custam o mesmo. Medido por
`eth_estimateGas` na chain 137 em 2026-08-12, com o console real montando a
calldata:

```
approve(LPVault, 1000000)            em USDC.e   80.604 gas   (slot de allowance zerado)
approve(LPVault, 500000000000000000) em WETH     47.624 gas   (slot ja escrito antes)
```

O número que este documento trazia — "~80.600 unidades **cada**" — era o primeiro
dos dois aplicado aos dois. A diferença não é do token: é de o slot de
`allowance` estar zerado ou já ter sido escrito alguma vez, e ela some assim que
o par de aprovações se repete.

## Passo 4 · Abrir a posição

**Quem assina:** o usuário. **Uma transação.**

```solidity
TriviuLPVault.abrir(AbrirParams p)
  → returns (uint256 tokenId, uint128 liquidez, uint256 usado0, uint256 usado1)
```

O que acontece dentro, lido do contrato:

1. `registry.isAllowedToken` nos **dois** tokens — senão reverte `TokenNaoPermitido`
2. `_puxa` transfere **exatamente** `amountDesired` da carteira dele
3. `_aprovaExato` autoriza o position manager pelo valor exato, e zera depois
4. `positionManager.mint(... recipient: msg.sender ...)`

**A posição nasce no nome dele.** O cofre **nunca é `ownerOf`** — é isso que
"não-custodial" significa aqui, e é verificável no explorador.

**Custo:** gás. **Taxa do protocolo: zero neste passo.**

## Passo 5 · A posição rende

**Quem assina:** ninguém. O tempo passa.

A posição acumula taxas enquanto o preço fica dentro da faixa. O console lê
`positions(tokenId)` e mostra `tokensOwed0` / `tokensOwed1`.

## Passo 6 · Autorizar o cofre naquela posição — **estava faltando aqui**

**Quem assina:** o usuário. **Uma transação, no position manager.**

```solidity
INonfungiblePositionManager.approve(address to, uint256 tokenId)   // to = 0xC52BaD28…
```

Este passo não constava deste documento até 2026-08-12, e a ausência não era
cosmética: sem ele os dois passos seguintes **revertem**. A exigência não aparece
na assinatura de `coletar` nem na de `fechar` — ela está no corpo das duas, e só
aparece lendo:

```solidity
function _exigeAprovacaoUnica(uint256 tokenId) private view {
    address aprovado = positionManager.getApproved(tokenId);
    if (aprovado == address(0)) revert AprovacaoAusente(tokenId);
    if (aprovado != address(this)) revert AprovacaoAmpla(tokenId);
}
```

**E não pode ser `setApprovalForAll`.** `getApproved` devolve a aprovação de UMA
posição e não é escrita por `setApprovalForAll`, então quem tiver concedido a
ampla vê `AprovacaoAmpla` e a transação para. Isso é deliberado: o caminho largo
não dirige este contrato nem quando o usuário já o abriu por engano em outro
lugar.

Revogar é o mesmo `approve` para o endereço zero, no mesmo contrato, e não passa
por nós.

**Custo:** gás de uma transação.

## Passo 7 · Coletar taxas (opcional, repetível)

**Quem assina:** o usuário.

```solidity
TriviuLPVault.coletar(uint256 tokenId, uint16 feeBpsMax, uint256 prazo)
```

`feeBpsMax` é **o teto que ele assina**. Se a alíquota do registry passar disso,
a transação **reverte** com `TaxaAcimaDoLimite`. Dono comprometido não consegue
subir a taxa em pleno voo — o usuário carrega o próprio teto.

**O `coletar` registra e não cobra.** Ler o principal atual exigiria preço, e o
protocolo não cobra com base em preço.

## Passo 8 · Fechar — e é aqui que a taxa cai

**Quem assina:** o usuário. Exige a mesma autorização do passo 6.

```solidity
TriviuLPVault.fechar(...)
```

A regra, lida do código:

```solidity
_houveResultado(tokenId, saiu0, saiu1)
  → q.dep0 == 0 && q.dep1 == 0  ? false          // sem registro: cobra ZERO
  → saiu0 >= q.dep0 && saiu1 >= q.dep1           // PRICE-FREE, token a token
```

**Se não houve resultado, `bps = 0`.** O protocolo só é pago quando saiu ≥ o que
entrou, **em cada token**, sem consultar preço nenhum. Posição que encolheu não
paga. Posição sem depósito registrado não paga — **registro ausente não é zero**.

Havendo resultado: **30%** (`feeBps = 3000`), com teto duro de 50% cravado no
bytecode (`MAX_FEE_BPS = 5000`), e a saída do dono é **incondicional** —
`if (f.taxa0 > f.total0) f.taxa0 = f.total0`.

**A taxa vai para a tesouraria** = Safe `0x73e344Be…`, medido.

## A matemática, com o seu número

Usuário leva **$100** líquidos:

```
bruto            142,857142
taxa 30%          42,857142
  → afiliado 30%  12,857142     ← hoje MANUAL
  → protocolo 70% 30,000000
usuario           100,000000
```

**O repasse ao afiliado não acontece on-chain.** O `TriviuReferralVault` não está
implantado; a taxa vai inteira à tesouraria e o split é operação manual. Está
escrito aqui para não virar surpresa.

---

# TRILHA B · Ciclo com tríade própria — falta implantar

## O que falta na chain, medido

```
TriviuRegistry   NAO implantada     ← a porta de entrada
TriviuFactory    NAO implantada     ← quem cunha o clone
```

Varredura dos nonces 1682-1692 do deployer: só os dois `LPVault`. Nenhuma das
duas está na Polygon.

## Passo 1 · Registrar-se

**Quem assina:** o usuário.

```solidity
TriviuRegistry.registrar()
```

Sem argumentos: quem registra é `msg.sender`. Reverte `JaRegistrado` na segunda vez.

## Passo 2 · Implantar o cofre — o clone nasce no nome dele

**Quem assina:** o usuário. **Ele paga o gás da criação.**

```solidity
TriviuRegistry.implantarCofre(address base) → address cofre
```

O Registry chama a Factory; a Factory faz `new TriviuVault(dono, base)` com
`dono = msg.sender`.

**E a Factory não aceita ser chamada por mais ninguém:** `implantarCofre` reverte
com `NaoEOregistro(quemChamou, registro)` para qualquer origem que não seja o
Registry. Não existe caminho lateral para cunhar cofre no nome errado.

**É aqui que "eles clonam os nossos contratos" acontece.** O bytecode é o nosso,
auditado, fixado por `new TriviuVault(...)` — **não vem de fora, não é
parametrizável**. O dono é ele. A custódia é dele.

## Passo 3 · Escolher o modo

**Construtor** — ele lê cada função antes de chamar, com o cálculo de gás por
rede na tela, e assina passo a passo.

**Co-Piloto** — a sequência é montada e narrada; ele confirma **três vezes** na
carteira. O co-piloto **nunca** toca a chave.

Os dois chamam **as mesmas funções**. A diferença é quanto o console explica
antes de cada assinatura, não o que é assinado.

## Passo 4 · Erguer a cerca

**Quem assina:** o usuário. Cada limite é uma transação `soDono`:

```solidity
TriviuCerca.definirAtivo(token, permitido)
TriviuCerca.definirRouter(router, permitido)
TriviuCerca.definirTamanho(minimo, maximo)
TriviuCerca.definirPisoDeLucro(bps)
TriviuCerca.definirPrecoMaximoDeGas(teto)
TriviuCerca.definirOperador(novo)        ← aqui ele nos autoriza a operar
TriviuCerca.definirPausa(valor)          ← e aqui ele nos desliga, quando quiser
```

**A cerca nasce fechada.** Tetos negam em zero, conjuntos negam vazios, o piso de
lucro nega em zero. Nada opera antes de ele dizer o que permite.

**`definirOperador` é o único ponto em que ele nos dá algo** — e é revogável por
ele, a qualquer momento, sem nos consultar.

## Passo 5 · Depositar

```solidity
TriviuVault.depositar(uint256 quantia)   soDono
TriviuVault.sacar(uint256 quantia)       soDono
TriviuVault.resgatar(address token, uint256 quantia)   soDono
```

**As três são `soDono`.** Nós não conseguimos sacar. Nunca. Não é política — é o
modificador no contrato.

## Passo 6 · Nós enviamos a operação

**Quem assina:** **nós**, o operador — e só o que a cerca dele permite.

```solidity
TriviuCerca.ciclar(principal, minProfit, legs)
```

A cerca valida **antes** de deixar passar: router permitido, os dois tokens de
cada perna permitidos, continuidade da cadeia (perna N começa onde N-1 terminou,
o ciclo abre e fecha na base), tamanho dentro dos limites, preço de gás abaixo do
teto, e `minProfit ≥ piso × principal`.

Passando, ela chama `cofre.ciclar(...)` e **confere de novo o que voltou**:

```solidity
if (crescimento < lucroExigido) revert LucroEntregueAbaixoDoPiso(...)
```

**O portão atômico do Executor fecha por baixo:**

```solidity
finalBalance >= startBalance + principal + minProfit
```

Se não cresceu, **a transação inteira reverte**. O principal dele não sai do
cofre. É por isso que um operador comprometido não alcança o capital: o teto dele
é 50% do lucro, nunca o principal.

## Passo 7 · A taxa

Mesma regra da trilha A: **só sobre resultado**. Ciclo que não lucra não paga.
Ciclo que reverte não existe.

---

# O que falta para 100%, na ordem

| # | o quê | quem |
|---|---|---|
| 1 | implantar `TriviuRegistry` + `TriviuFactory` na Polygon | Medusa → Nautilo → Tubarão N2 → Leão |
| 2 | ~~trocar a carteira **simulada** do console pela real~~ **FEITO 2026-08-12** — a camada simulada saiu de `/console/`, e os banners com ela | Onça, sob as 10 regras do Tubarão |
| 3 | ~~ligar o console ao LP (trilha A)~~ **FEITO 2026-08-12** — `approve` × 2 → `abrir` → `approve` ERC-721 → `coletar` → `fechar`, calldata conferida byte a byte contra `cast`. **Falta rodar com valor real**, que exige a chave do fundador | Onça |
| 4 | ligar a tríade (trilha B) — depende do passo 1 | Onça |
| 5 | implantar `TriviuReferralVault` para o split 70/30 sair do manual | onda própria |

**O passo 3 põe usuário operando com dinheiro real sem depender de nenhum deploy
novo.** É por isso que ele vem antes do 4.

---

*Assinaturas lidas de `triviu-engine/contracts/src/`. Endereços e estado medidos
contra a chain 137. O que não existe está escrito como não existente.*
