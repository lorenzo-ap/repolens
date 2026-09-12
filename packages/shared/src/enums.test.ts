import { describe, expect, it } from "vitest";
import { FindingsQuerySchema } from "./api";
import { gradeForScore, SEVERITY_RANK } from "./enums";

describe("gradeForScore", () => {
  it("maps bands to grades", () => {
    expect(gradeForScore(100)).toBe("A");
    expect(gradeForScore(90)).toBe("A");
    expect(gradeForScore(89.9)).toBe("B");
    expect(gradeForScore(65)).toBe("C");
    expect(gradeForScore(50)).toBe("D");
    expect(gradeForScore(0)).toBe("F");
  });
});

describe("severity rank", () => {
  it("orders critical first", () => {
    expect(SEVERITY_RANK.critical).toBeLessThan(SEVERITY_RANK.high);
    expect(SEVERITY_RANK.low).toBeLessThan(SEVERITY_RANK.info);
  });
});

describe("FindingsQuerySchema", () => {
  it("normalises scalar filters to arrays and applies defaults", () => {
    const parsed = FindingsQuerySchema.parse({ severity: "high", limit: "20" });
    expect(parsed.severity).toEqual(["high"]);
    expect(parsed.limit).toBe(20);
    expect(parsed.sort).toBe("severity");
  });
  it("rejects unknown severities", () => {
    expect(() => FindingsQuerySchema.parse({ severity: "urgent" })).toThrow();
  });
});
