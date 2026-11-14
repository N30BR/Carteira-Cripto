import { describe, expect, test } from "vitest";
import { ema, fajDogepack } from "@/lib/charts/indicators";

// Referência independente (implementação literal de ta.rma / ta.rsi / ta.ema do Pine, passo a passo).
function pineRef(src: number[], len: number, emaLen: number) {
  const rma = (x: (number | null)[], l: number) => {
    const out: (number | null)[] = [];
    let sum: number | null = null;
    const seen: number[] = [];
    for (const v of x) {
      if (v === null) {
        out.push(null);
        continue;
      }
      if (sum === null) {
        seen.push(v);
        if (seen.length === l) sum = seen.reduce((a, b) => a + b, 0) / l;
      } else sum = (v + (l - 1) * sum) / l;
      out.push(sum);
    }
    return out;
  };
  const ch = src.map((v, i) => (i === 0 ? null : v - src[i - 1]));
  const up = rma(ch.map((c) => (c === null ? null : Math.max(c, 0))), len);
  const dn = rma(ch.map((c) => (c === null ? null : Math.max(-c, 0))), len);
  const rsi = up.map((u, i) => (u === null || dn[i] === null ? null : dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / (dn[i] as number))));
  const alpha = 2 / (emaLen + 1);
  const out: (number | null)[] = [];
  let sum: number | null = null;
  const seen: number[] = [];
  for (const v of rsi) {
    if (v === null) {
      out.push(null);
      continue;
    }
    if (sum === null) {
      seen.push(v);
      if (seen.length === emaLen) sum = seen.reduce((a, b) => a + b, 0) / emaLen;
    } else sum = alpha * v + (1 - alpha) * sum;
    out.push(sum);
  }
  return { rsi, ema: out };
}

const closes = Array.from({ length: 300 }, (_, i) => 100 + 20 * Math.sin(i / 9) + 8 * Math.cos(i / 3.7) + i * 0.05);

describe("FAJ Dogepack", () => {
  test("RSI 14 (Wilder) e EMA 9 do RSI iguais à referência do Pine, sem deslocamento", () => {
    const got = fajDogepack(closes, 14, 9);
    const ref = pineRef(closes, 14, 9);
    expect(got.rsi.findIndex((v) => v !== null)).toBe(14);
    expect(got.ema.findIndex((v) => v !== null)).toBe(14 + 8);
    for (let i = 0; i < closes.length; i++) {
      if (ref.rsi[i] === null) expect(got.rsi[i]).toBeNull();
      else expect(got.rsi[i]).toBeCloseTo(ref.rsi[i] as number, 10);
      if (ref.ema[i] === null) expect(got.ema[i]).toBeNull();
      else expect(got.ema[i]).toBeCloseTo(ref.ema[i] as number, 10);
    }
  });
  test("a EMA é do RSI, não do preço", () => {
    const got = fajDogepack(closes, 14, 9);
    const priceEma = ema(closes, 9);
    expect(got.ema[100]).not.toBeCloseTo(priceEma[100] as number, 1);
    expect(got.ema.every((v) => v === null || (v >= 0 && v <= 100))).toBe(true);
  });
  test("casos especiais: só alta → 100; só queda → 0", () => {
    expect(fajDogepack(Array.from({ length: 30 }, (_, i) => i + 1), 14, 9).rsi[20]).toBe(100);
    expect(fajDogepack(Array.from({ length: 30 }, (_, i) => 100 - i), 14, 9).rsi[20]).toBe(0);
  });
  test("direção: subindo ou igual = alta; sem EMA anterior = sem direção", () => {
    const got = fajDogepack(closes, 14, 9);
    const first = got.ema.findIndex((v) => v !== null);
    expect(got.rising[first]).toBeNull();
    for (let i = first + 1; i < closes.length; i++) expect(got.rising[i]).toBe((got.ema[i] as number) >= (got.ema[i - 1] as number));
    expect(got.rising.some((r) => r === true) && got.rising.some((r) => r === false)).toBe(true);
  });
  test("outros períodos e poucos dados", () => {
    const got = fajDogepack(closes, 21, 5);
    const ref = pineRef(closes, 21, 5);
    expect(got.ema[200]).toBeCloseTo(ref.ema[200] as number, 10);
    expect(fajDogepack([1, 2, 3], 14, 9).rsi.every((v) => v === null)).toBe(true);
  });
});
