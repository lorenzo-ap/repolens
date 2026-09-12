import { describe, expect, it } from "vitest";
import { formatMoney } from "../src/utils/format";

describe("formatMoney", () => {
  it.only("formats cents", () => {
    expect(formatMoney(1234)).toBe("$12.34");
  });
  it.skip("handles zero", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });
});
