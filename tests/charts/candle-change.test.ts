import { describe, expect, test } from "vitest";
import { CHANGE_COLORS, candleChange } from "@/lib/charts/candle-change";

describe("variação da vela", () => {
  test("positiva, negativa e neutra, com 2 casas e cor", () => {
    expect(candleChange(97185.17, 101109.59)).toEqual({ text: "+4.04%", color: CHANGE_COLORS.up });
    expect(candleChange(100, 95.5)).toEqual({ text: "−4.50%", color: CHANGE_COLORS.down });
    expect(candleChange(100, 100)).toEqual({ text: "0.00%", color: CHANGE_COLORS.flat });
    // Arredonda para zero: neutra, sem sinal.
    expect(candleChange(100000, 100000.001)).toEqual({ text: "0.00%", color: CHANGE_COLORS.flat });
    expect(candleChange(1, 25)).toEqual({ text: "+2,400.00%", color: CHANGE_COLORS.up });
  });
  test("valores ausentes ou abertura zero", () => {
    expect(candleChange(0, 10)).toBeNull();
    expect(candleChange(undefined, 10)).toBeNull();
    expect(candleChange(10, undefined)).toBeNull();
    expect(candleChange(Number.NaN, 10)).toBeNull();
  });
});
