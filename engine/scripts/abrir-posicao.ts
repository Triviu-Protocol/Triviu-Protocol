/**
 * O MOTOR CONTRA O COFRE REAL — e ele não envia nada.
 *
 *   npm run abrir
 *
 * Lê um cofre V0 na chain, pergunta à estratégia dele o que propõe, monta a
 * abertura, calcula o piso da profundidade da pool e para na porta. `dry_run` é
 * verdadeiro por padrão e este script NÃO tem caminho de assinatura: ele mostra
 * exatamente em qual das três etapas o cofre está e o que falta para a próxima.
 *
 * Ambiente (tudo tem padrão medido em 2026-08-24):
 *   TRIVIU_RPC     nó da Polygon            polygon-bor-rpc.publicnode.com
 *                  (polygon-rpc.com devolve 401 desde 2026-08-24)
 *   TRIVIU_VAULT   endereço do cofre        0xDd2d…3508
 *   TRIVIU_BASE    moeda-base do cofre      USDC nativa
 *   TRIVIU_POOL    pool WMATIC/USDC para o piso; sem ela o piso é o da estratégia
 *   TRIVIU_TOL_BPS tolerância do piso       192 (p99 medido da janela de 15 min)
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { polygon } from "viem/chains";
import { prepararAbertura, TOLERANCIA_P99_BPS, type ProfundidadeDaPool } from "../src/vault/abertura.js";
import type { VaultClient } from "../src/vault/leitura.js";
import { aviso, falha, info } from "../src/seguranca/saida.js";
import { origemDe } from "../src/seguranca/redigir.js";

const RPC = process.env["TRIVIU_RPC"] ?? "https://polygon-bor-rpc.publicnode.com";
const VAULT = (process.env["TRIVIU_VAULT"] ?? "0xDd2d59866E20Ed354EaFaB49FdbD6cFce7243508") as Address;
const BASE = (process.env["TRIVIU_BASE"] ?? "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359") as Address;
const POOL = process.env["TRIVIU_POOL"] as Address | undefined;
/* 192 bps, e não um número redondo escolhido por gosto: é o p99 do movimento de
   preço em 200 janelas contíguas de 15 min medidas na pool real. `maxValidity` é
   900 s, e o piso trava na assinatura — ceder menos que isso reverte por movimento
   normal de mercado, não por execução ruim. */
const TOL_BPS = Number(process.env["TRIVIU_TOL_BPS"] ?? String(TOLERANCIA_P99_BPS));

const pairAbi = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);
const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);
const limitsAbi = parseAbi(["function limits() view returns (bytes32)"]);

const cliente = createPublicClient({ chain: polygon, transport: http(RPC) });

/** Lê a pool de verdade. Sem isto o piso viria de reserva inventada. */
async function lerProfundidade(pool: Address, tokenIn: Address, tokenOut: Address) {
  const [t0, t1, reservas] = await Promise.all([
    cliente.readContract({ address: pool, abi: pairAbi, functionName: "token0" }),
    cliente.readContract({ address: pool, abi: pairAbi, functionName: "token1" }),
    cliente.readContract({ address: pool, abi: pairAbi, functionName: "getReserves" }),
  ]);
  const [d0, d1] = await Promise.all([
    cliente.readContract({ address: t0, abi: erc20Abi, functionName: "decimals" }),
    cliente.readContract({ address: t1, abi: erc20Abi, functionName: "decimals" }),
  ]);

  const entradaEhToken0 = t0.toLowerCase() === tokenIn.toLowerCase();
  const saidaConfere = (entradaEhToken0 ? t1 : t0).toLowerCase() === tokenOut.toLowerCase();
  if (!saidaConfere && !entradaEhToken0) return null;

  const decimalsIn = entradaEhToken0 ? d0 : d1;
  const decimalsOut = entradaEhToken0 ? d1 : d0;
  const rIn = Number(entradaEhToken0 ? reservas[0] : reservas[1]) / 10 ** decimalsIn;
  const rOut = Number(entradaEhToken0 ? reservas[1] : reservas[0]) / 10 ** decimalsOut;

  const prof: ProfundidadeDaPool = {
    pool,
    tokenIn: entradaEhToken0 ? t0 : t1,
    tokenOut: entradaEhToken0 ? t1 : t0,
    decimalsIn,
    decimalsOut,
    /* QuickSwap v2 cobra 0,30%. Pool de outra taxa exige mudar aqui, e o motor
       não tem como descobrir isso do par sozinho. */
    hop: { gamma: 0.997, reserveIn: rIn, reserveOut: rOut },
    toleranciaBps: TOL_BPS,
  };
  return prof;
}

async function main() {
  info(`nó         ${origemDe(RPC)}`);
  info(`cofre      ${VAULT}`);
  info(`base       ${BASE}`);
  info("");

  const [bloco, agora, saldo, limitsRaw] = await Promise.all([
    cliente.getBlockNumber(),
    cliente.getBlock().then((b) => b.timestamp),
    cliente.readContract({ address: BASE, abi: erc20Abi, functionName: "balanceOf", args: [VAULT] }),
    cliente.readContract({ address: VAULT, abi: limitsAbi, functionName: "limits" }),
  ]);

  const l = BigInt(limitsRaw);
  const u64 = (1n << 64n) - 1n;
  const cooldown = (l >> 192n) & u64;
  const maxValidity = (l >> 128n) & u64;
  const minRatioBps = (l >> 112n) & 0xffffn;
  const quantum = l & ((1n << 112n) - 1n);

  info(`bloco ${bloco} · relógio da chain ${agora}`);
  info(`saldo da base no cofre: ${Number(saldo) / 1e6} unidades`);
  info(`limits: cooldown ${cooldown}s · maxValidity ${maxValidity}s · minRatioBps ${minRatioBps} · quantum ${quantum}`);
  if (minRatioBps === 0n) {
    aviso("minRatioBps=0: a guarda global do cofre está desligada — o piso que protege é o operatorMinOut, calculado aqui.");
  }
  info("");

  /* A profundidade só entra se o par bater; `pisoDaProfundidade` recusa o resto. */
  let profundidade: ProfundidadeDaPool | undefined;
  if (POOL) {
    /* O sentido é decidido pelo Intent, mas a pool é lida antes dele: pedimos no
       sentido da COMPRA e a guarda do par rejeita se a operação for outra. */
    const p = await lerProfundidade(POOL, BASE, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270");
    if (!p) {
      aviso(`a pool ${POOL} não contém o par pedido — seguindo com o piso da estratégia`);
    } else {
      profundidade = p;
      info(`pool ${p.pool} · reservas ${p.hop.reserveIn.toFixed(2)} / ${p.hop.reserveOut.toFixed(2)} · tolerância ${TOL_BPS} bps`);
      info("");
    }
  } else {
    aviso("TRIVIU_POOL não informada — o piso será o fixo da estratégia, que não acompanha profundidade.");
    info("");
  }

  const r = await prepararAbertura(cliente as unknown as VaultClient, {
    vault: VAULT,
    base: BASE,
    chainId: 137n,
    candidateLotId: 0n,
    escolhas: {
      executor: "0x323C4192b269EA56aCd147dDbd3F71056E63E835",
      router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
      agora,
      janela: 600n,
    },
    maxValidity,
    agoraDaChain: agora,
    env: process.env,
    profundidade,
    /* dry_run e simulacaoOk ficam nos padrões seguros de propósito: este script
       existe para MOSTRAR o estado, e não há caminho de assinatura nele. */
  });

  info(`ETAPA: ${r.etapa}`);
  if (r.etapa === "recusado-pelo-cofre") {
    info(`  o cofre recusou: ${r.erro ?? "sem nome de erro"}`);
    if (r.oQueFazer) info(`  o que fazer   : ${r.oQueFazer}`);
    if (r.detalhe) info(`  detalhe       : ${r.detalhe}`);
    return;
  }
  if (r.etapa === "rota-nao-alcanca-o-piso") {
    aviso("a rota não alcança o piso que a PRÓPRIA estratégia exige — parado antes do gás");
    info(`  pool          : ${r.pool}`);
    info(`  a rota entrega: ${r.esperado}`);
    info(`  a estratégia  : ${r.exigidoPelaEstrategia}`);
    info(`  faltam        : ${r.faltamBps} bps`);
    info("  saídas: pool mais funda para este par · ticket menor · ou o dono baixa o piso da estratégia");
    return;
  }

  info(`  piso assinado : ${r.submissao.params.operatorMinOut}`);
  info(`  apertado?     : ${r.piso.apertado ? "SIM, da profundidade real" : `não — ${r.piso.porque}`}`);
  if (r.piso.apertado) {
    info(`  a estratégia pedia ${r.piso.daEstrategia} · a pool entrega ~${r.piso.esperado}`);
  }
  info(`  executionHash : ${r.submissao.executionHash}`);
  info(`  porta         : ${r.decisao.reason}`);
  info("");
  info("Nada foi enviado. Este script não assina.");
}

main().catch((err) => {
  falha(err);
  process.exit(1);
});
