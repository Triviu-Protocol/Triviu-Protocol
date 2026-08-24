/**
 * Parity against the 60-digit reference, by vectors rather than by reading.
 *
 * `dimensionar.ts` rewrites both closed forms to avoid subtracting nearly-equal numbers,
 * so "it looks like the paper" proves nothing — the code deliberately does not look like
 * the paper. What has to hold is the *number*, and the vectors in
 * `dimensionar.vetores.json` come from the reference implementation running at 60 decimal
 * digits, across edges from 2,4% down to 1e-6.
 *
 * The last block does **not** justify the rewrite — it measures it, and the measurement
 * came out smaller than the argument. Both forms agree to nine digits at an edge of 1e-6.
 * The header of `dimensionar.ts` says so plainly, because a tidy story that the test
 * refuses is exactly what this repository exists to catch.
 */
import { describe, expect, it } from "vitest";

import vetores from "./dimensionar.vetores.json" with { type: "json" };
import {
  compose,
  cycleOut,
  noArbThreshold,
  solveCycle,
  solveCycleNumeric,
  DEPTH_WARNING_FRACTION,
  type Hop,
} from "./dimensionar.js";

interface VetorCiclo {
  nome: string;
  hops: Hop[];
  phi: number;
  edge: number;
  optimalIn: number;
  grossProfit: number;
  e1: number;
  e2: number;
  e3: number;
}

const ciclos = (vetores as unknown[]).filter(
  (v): v is VetorCiclo => typeof (v as VetorCiclo).hops !== "undefined"
);

const limiar = (vetores as unknown[]).find(
  (v) => (v as { nome: string }).nome === "no_arb_threshold"
) as { gammas: number[]; phi: number; threshold: number };

describe("UM HOP — o caso que os vetores não cobrem", () => {
  /**
   * Medido: dos 10 vetores, 8 têm 2 hops, 1 tem 3, 1 tem zero. NENHUM tem 1.
   *
   * Um hop não é ciclo — não há arbitragem em trocar A por B — então ele não
   * cabe no arquivo de referência de 60 dígitos sem que `edge` e `optimalIn`
   * fossem INVENTADOS. Por isso a cobertura vive aqui, e os valores esperados
   * vêm de ÁLGEBRA, não da função que está sendo testada.
   *
   * A composição de Möbius com um único hop é, por definição:
   *     z = γ·Ro·x / (Ri + γ·x)   →   E1 = γ·Ro · E2 = Ri · E3 = γ
   */
  const hop = { gamma: 0.997, reserveIn: 1_000_000, reserveOut: 2_500_000 };

  it("compose de 1 hop é E1 = γ·Ro · E2 = Ri · E3 = γ", () => {
    const c = compose([hop]);
    expect(c.e1).toBeCloseTo(hop.gamma * hop.reserveOut, 6);
    expect(c.e2).toBeCloseTo(hop.reserveIn, 6);
    expect(c.e3).toBeCloseTo(hop.gamma, 12);
  });

  it("cycleOut de 1 hop é IDÊNTICO ao swap de produto constante", () => {
    /* Comparado contra a fórmula canônica — fonte independente da implementação,
       e não contra a própria função. */
    for (const x of [1, 1e3, 5e5, 2e6]) {
      const canonico = (hop.gamma * x * hop.reserveOut) / (hop.reserveIn + hop.gamma * x);
      expect(cycleOut(x, [hop]) / canonico).toBeCloseTo(1, 12);
    }
  });

  it("os vetores realmente NÃO cobrem 1 hop — se um dia cobrirem, este teste avisa", () => {
    /* Se alguém acrescentar um vetor de 1 hop, esta asserção cai e a duplicação
       de cobertura fica visível em vez de silenciosa. */
    const deUmHop = ciclos.filter((v) => v.hops.length === 1);
    expect(deUmHop, "vetor de 1 hop apareceu: reveja se este bloco ainda é necessário").toHaveLength(0);
  });
});

describe("solveCycle — paridade com a referência de 60 dígitos", () => {
  it("tem vetores para checar", () => {
    expect(ciclos.length).toBeGreaterThanOrEqual(9);
  });

  for (const v of ciclos) {
    it(`${v.nome} — edge, x* e P*`, () => {
      const r = solveCycle(v.hops, v.phi, 0);

      // 1e-9 relativo: float64 carrega ~1e-16, e a composição de 2–3 hops mais as raízes
      // consomem alguns dígitos. Folga de sete ordens sobre o limite da máquina, e ainda
      // assim apertado o bastante para que um erro de fórmula não passe.
      expect(r.edge).not.toBeNull();
      expect(r.edge!).toBeCloseTo(v.edge, Math.max(0, -Math.log10(Math.abs(v.edge)) + 6));
      if (v.optimalIn > 0) {
        expect(r.optimalIn / v.optimalIn).toBeCloseTo(1, 9);
        expect(r.grossProfit / v.grossProfit).toBeCloseTo(1, 9);
      } else {
        expect(r.optimalIn).toBe(0);
        expect(r.worthExecuting).toBe(false);
      }
    });
  }

  it("compõe E1, E2 e E3 como a referência", () => {
    for (const v of ciclos) {
      const c = compose(v.hops);
      expect(c.e1 / v.e1).toBeCloseTo(1, 9);
      expect(c.e2 / v.e2).toBeCloseTo(1, 9);
      expect(c.e3 / v.e3).toBeCloseTo(1, 9);
    }
  });
});

describe("noArbThreshold", () => {
  it("reproduz o limiar da referência", () => {
    expect(noArbThreshold(limiar.gammas, limiar.phi)).toBeCloseTo(limiar.threshold, 12);
  });

  it("três pools de 0,30% com flash de 0,05% exigem 0,956% de divergência", () => {
    // Abaixo disso nenhum tamanho torna o ciclo lucrativo — o limiar não depende de x.
    expect(noArbThreshold([0.997, 0.997, 0.997], 0.0005) * 100).toBeCloseTo(0.9559, 3);
  });
});

describe("o que a curva de lucro implica", () => {
  it("o lucro escala com o QUADRADO do edge", () => {
    // Dez vezes menos edge, cem vezes menos lucro. É por isso que um principal fixo
    // não pode estar certo para dois ciclos diferentes.
    const e3 = ciclos.find((v) => v.nome.includes("1e-03"))!;
    const e4 = ciclos.find((v) => v.nome.includes("1e-04"))!;

    expect(e3.grossProfit / e4.grossProfit).toBeCloseTo(100, -1);
    expect(e3.optimalIn / e4.optimalIn).toBeCloseTo(10, -1);
  });

  it("passar do x* ótimo destrói o lucro", () => {
    const v = ciclos.find((x) => x.nome.includes("edge grande"))!;
    const { optimalIn, grossProfit } = solveCycle(v.hops, v.phi, 0);
    const kappa = 1 + v.phi;
    const lucroEm = (x: number) => cycleOut(x, v.hops) - kappa * x;

    expect(lucroEm(optimalIn)).toBeCloseTo(grossProfit, 6);
    expect(lucroEm(optimalIn * 4)).toBeLessThan(0);
    expect(lucroEm(optimalIn / 10)).toBeLessThan(grossProfit);
  });

  it("o gás não move o x*, só o go/no-go", () => {
    const v = ciclos.find((x) => x.nome.includes("edge grande"))!;
    const sem = solveCycle(v.hops, v.phi, 0);
    const com = solveCycle(v.hops, v.phi, sem.grossProfit * 2);

    expect(com.optimalIn).toBe(sem.optimalIn);
    expect(com.worthExecuting).toBe(false);
    expect(sem.worthExecuting).toBe(true);
  });
});

describe("a forma ingênua da derivação, medida em vez de assumida", () => {
  it("as duas formas concordam · a reescrita não resgata nada dramático", () => {
    // Escrevi primeiro que a forma literal "perde todos os dígitos", e este teste
    // recusou: no edge de 1e-6 o erro literal é 4,6e-11 contra 5,4e-12 do estável —
    // melhor, mas oito vezes, não mil. Medido de 1e-3 a 1e-13 a razão fica entre 0,3×
    // e 2,0×. O cancelamento existe e não é o erro dominante: compor E1 e E2 a partir
    // de reservas grandes já gasta mais dígitos do que a subtração.
    const v = ciclos.find((x) => x.nome.includes("1e-06"))!;
    const { e1, e2, e3 } = compose(v.hops);
    const kappa = 1 + v.phi;

    const ingenua = (Math.sqrt((e1 * e2) / kappa) - e2) / e3;
    const estavel = solveCycle(v.hops, v.phi, 0).optimalIn;

    // As duas servem. É isso que o teste afirma, e é só isso que a medição sustenta.
    expect(Math.abs(estavel / v.optimalIn - 1)).toBeLessThan(1e-9);
    expect(Math.abs(ingenua / v.optimalIn - 1)).toBeLessThan(1e-9);
    expect(estavel / ingenua).toBeCloseTo(1, 8);
  });
});

describe("solveCycleNumeric — o recuo quando o tick é cruzado", () => {
  it("encontra o mesmo ótimo enquanto a faixa não é cruzada", () => {
    const v = ciclos.find((x) => x.nome.includes("edge grande"))!;
    const fechado = solveCycle(v.hops, v.phi, 0);
    const numerico = solveCycleNumeric(
      (x) => cycleOut(x, v.hops),
      fechado.optimalIn * 20,
      v.phi,
      0
    );

    expect(numerico.optimalIn / fechado.optimalIn).toBeCloseTo(1, 4);
    expect(numerico.grossProfit / fechado.grossProfit).toBeCloseTo(1, 4);
  });

  it("segue o simulador quando ele deixa de ser produto constante", () => {
    // Liquidez que acaba: acima de um limite o preço para de melhorar. A forma fechada
    // não sabe disso e superestima; a busca ternária acompanha o simulador.
    const v = ciclos.find((x) => x.nome.includes("edge grande"))!;
    const teto = solveCycle(v.hops, v.phi, 0).optimalIn / 4;
    const simulador = (x: number) => cycleOut(Math.min(x, teto), v.hops);

    const numerico = solveCycleNumeric(simulador, teto * 40, v.phi, 0);

    expect(numerico.optimalIn).toBeLessThanOrEqual(teto * 1.01);
    expect(numerico.grossProfit).toBeLessThan(solveCycle(v.hops, v.phi, 0).grossProfit);
  });
});


describe("achados do N1 desta onda", () => {
  it("o solver numérico devolve edge null, nunca NaN", () => {
    // NaN faz TODA comparação virar false: `edge > limiar` tomaria o ramo do não em
    // silêncio, e quem consome não distinguiria "sem edge" de "edge não calculado".
    const v = ciclos.find((x) => x.nome.includes("edge grande"))!;
    const n = solveCycleNumeric((x) => cycleOut(x, v.hops), 1e6, v.phi, 0);

    expect(n.edge).toBeNull();
    expect(Number.isNaN(n.edge as unknown as number)).toBe(false);
  });

  it("x* se auto-limita · a suspeita de tamanho absurdo não se confirmou", () => {
    // Medido: mesmo um edge de 1000% só pede 19,3% da reserva. O produto constante já
    // segura o tamanho — o risco não é pedir demais, é cruzar tick.
    const v = ciclos.find((x) => x.nome.includes("edge grande"))!;
    const r = solveCycle(v.hops, v.phi, 0);

    expect(r.fractionOfFirstPool).toBeLessThan(0.25);
    expect(r.optimalIn).toBeLessThan(v.hops[0]!.reserveIn);
  });

  it("avisa quando o tamanho passa da fração em que o tick começa a importar", () => {
    const Ri = 1_000_000;
    const g = 0.997;
    const hops: Hop[] = [
      { gamma: g, reserveIn: Ri, reserveOut: 2_000_000 },
      { gamma: g, reserveIn: (g * 2_000_000 * g * Ri) / (1.0005 * 3 * Ri), reserveOut: Ri },
    ];
    const r = solveCycle(hops, 0.0005, 0);

    expect(r.fractionOfFirstPool!).toBeGreaterThan(DEPTH_WARNING_FRACTION);
  });
});
