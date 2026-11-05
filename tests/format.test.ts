import { describe, expect, test } from "vitest";
import { formatPct, formatQty, formatUsd } from "@/lib/format";

describe("format", () => {
  test("formatUsd no padrão brasileiro", () => {
    expect(formatUsd(48230.12)).toBe("US$ 48.230,12");
    expect(formatUsd(0)).toBe("US$ 0,00");
    expect(formatUsd(-12.5)).toBe("-US$ 12,50");
  });

  test("formatPct com 2 casas", () => {
    expect(formatPct(0.6234)).toBe("62,34%");
    expect(formatPct(-0.012)).toBe("-1,20%");
    expect(formatPct(1)).toBe("100,00%");
  });

  test("formatQty sem zeros à direita e sem notação científica", () => {
    expect(formatQty("0.00000001")).toBe("0,00000001");
    expect(formatQty("1.50000000")).toBe("1,5");
    expect(formatQty("12345.5")).toBe("12.345,5");
    expect(formatQty("0.123456789")).toBe("0,12345679");
    expect(formatQty(1e-8)).toBe("0,00000001");
    expect(formatQty("2")).toBe("2");
  });
});
