import { describe, expect, test } from "vitest";
import { coinColor } from "@/components/dashboard/palette";

describe("cores dos tokens", () => {
  test("cores oficiais pedidas e null para as demais", () => {
    expect(coinColor("BTC")).toBe("#F7931A");
    expect(coinColor("eth")).toBe("#4B5563");
    expect(coinColor("USDT")).toBe("#26A17B");
    expect(coinColor("SOL")).toBe("#9945FF");
    expect(coinColor("LINK")).toBe("#2A5ADA");
    expect(coinColor("AAVE")).toBe("#7C6CFF");
    expect(coinColor("TAO")).toBe("#8B8F97");
    expect(coinColor("XLM")).toBe("#1F2937");
    expect(coinColor("NEAR")).toBe("#FFFFFF");
    expect(coinColor("PEPE")).toBeNull();
  });
});
