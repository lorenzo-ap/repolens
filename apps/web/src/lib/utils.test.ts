import { describe, expect, it } from "vitest";
import { fmt, formatDuration, pct, scoreBand, shortSha, truncateMiddle } from "./utils";

describe("formatters", () => {
  it("formats numbers with separators and placeholders", () => {
    expect(fmt(1234567)).toBe("1,234,567");
    expect(fmt(null)).toBe("–");
    expect(fmt(1.2345, 2)).toBe("1.23");
  });
  it("formats percentages and durations", () => {
    expect(pct(0.256)).toBe("26%");
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(9_400)).toBe("9.4 s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });
  it("shortens shas and long paths", () => {
    expect(shortSha("abcdef1234567890")).toBe("abcdef1");
    expect(shortSha(null)).toBe("–");
    expect(truncateMiddle("src/components/very/long/path/to/file.tsx", 20)).toBe(
      "src/compon…/file.tsx",
    );
  });
  it("maps scores to bands", () => {
    expect(scoreBand(95)).toBe("good");
    expect(scoreBand(70)).toBe("medium");
    expect(scoreBand(45)).toBe("high");
    expect(scoreBand(10)).toBe("critical");
    expect(scoreBand(null)).toBe("none");
  });
});
