import { describe, expect, test } from "vitest";
import {
  adjustChange,
  factor,
  formatMoney,
  formatMoneyPrice,
  parseCurrency,
  rateAt,
} from "@/lib/currency";

const rates = { usdtBrl: 5, btcUsdt: 50000 };

describe("parseCurrency", () => {
  test("aceita as três e cai no padrão", () => {
    expect(parseCurrency("BRL", "USDT")).toBe("BRL");
    expect(parseCurrency("btc", "USDT")).toBe("BTC");
    expect(parseCurrency("EUR", "BRL")).toBe("BRL");
    expect(parseCurrency(undefined, "USDT")).toBe("USDT");
  });
});

describe("factor", () => {
  test("a partir de USDT", () => {
    expect(factor("USDT", "USDT", rates)).toBe(1);
    expect(factor("USDT", "BRL", rates)).toBe(5);
    expect(factor("USDT", "BTC", rates)).toBeCloseTo(1 / 50000, 12);
  });
  test("a partir de BRL", () => {
    expect(factor("BRL", "BRL", rates)).toBe(1);
    expect(factor("BRL", "USDT", rates)).toBeCloseTo(0.2, 12);
    expect(factor("BRL", "BTC", rates)).toBeCloseTo(1 / 250000, 12);
  });
  test("sem cotação necessária: null", () => {
    expect(factor("USDT", "BRL", { usdtBrl: null, btcUsdt: 1 })).toBeNull();
    expect(factor("USDT", "BTC", { usdtBrl: 1, btcUsdt: null })).toBeNull();
    expect(factor("USDT", "USDT", { usdtBrl: null, btcUsdt: null })).toBe(1);
    expect(factor("BRL", "BRL", { usdtBrl: null, btcUsdt: null })).toBe(1);
  });
});

describe("rateAt", () => {
  test("última cotação até o instante; antes do histórico usa a mais antiga", () => {
    const pts: [number, number][] = [[100, 5], [200, 6]];
    expect(rateAt(pts, 150)).toBe(5);
    expect(rateAt(pts, 250)).toBe(6);
    expect(rateAt(pts, 50)).toBe(5);
    expect(rateAt([], 50)).toBeNull();
  });
});


describe("adjustChange", () => {
  test("variação na moeda de referência", () => {
    // preço +10% em USDT, BRL subiu de 5 para 5,5 por USDT → +21% em BRL
    expect(adjustChange(10, 5.5, 5)).toBeCloseTo(21, 10);
    expect(adjustChange(10, 1, 1)).toBeCloseTo(10, 10);
    expect(adjustChange(null, 1, 1)).toBeNull();
    expect(adjustChange(5, 1, null)).toBeNull();
  });
});

describe("formatMoney", () => {
  test("três moedas", () => {
    expect(formatMoney(1234.5, "USDT")).toBe("US$ 1.234,50");
    expect(formatMoney(1234.5, "BRL")).toBe("R$ 1.234,50");
    expect(formatMoney(-12, "BRL")).toBe("-R$ 12,00");
    expect(formatMoney(0.58912345, "BTC")).toBe("₿ 0,58912345");
    expect(formatMoney(2, "BTC")).toBe("₿ 2,00000000");
  });
  test("preço unitário", () => {
    expect(formatMoneyPrice(0.00001234, "USDT")).toBe("US$ 0,00001234");
    expect(formatMoneyPrice(0.1654, "BRL")).toBe("R$ 0,1654");
    expect(formatMoneyPrice(1.5e-10, "BTC")).toBe("< ₿ 0,00000001");
    expect(formatMoneyPrice(0.0123, "BTC")).toBe("₿ 0,01230000");
  });
});
