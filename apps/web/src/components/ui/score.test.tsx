import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeverityBadge, StatusBadge } from "./badge";
import { Delta, HealthScore, ScoreText } from "./score";

describe("HealthScore", () => {
  it("announces the score and status for assistive technology", () => {
    render(<HealthScore score={83.4} delta={2.1} />);
    expect(screen.getByRole("img", { name: "Health score: 83 of 100, Good" })).toBeTruthy();
    expect(screen.getByText("83")).toBeTruthy();
    expect(screen.getByText("Good")).toBeTruthy();
    expect(screen.getByText(/\+2\.1 vs previous/)).toBeTruthy();
  });
  it("handles a missing score", () => {
    render(<HealthScore score={null} />);
    expect(screen.getByRole("img", { name: "Health score: not available" })).toBeTruthy();
  });
});

describe("Delta", () => {
  it("colours by direction and desirability", () => {
    const { container: up } = render(<Delta value={3.2} digits={1} />);
    expect(up.textContent).toContain("+3.2");
    expect(up.querySelector(".text-good")).toBeTruthy();
    const { container: worse } = render(<Delta value={4} higherIsBetter={false} />);
    expect(worse.querySelector(".text-critical")).toBeTruthy();
    const { container: neutral } = render(<Delta value={-2} higherIsBetter={null} />);
    expect(neutral.querySelector(".text-fg-secondary")).toBeTruthy();
    const { container: zero } = render(<Delta value={0.04} digits={1} suffix="%" />);
    expect(zero.textContent).toContain("0%");
  });
});

describe("badges", () => {
  it("labels severities accessibly", () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByLabelText("Severity Critical")).toBeTruthy();
  });
  it("renders analysis status", () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText("running")).toBeTruthy();
  });
  it("renders score text with a band colour", () => {
    const { container } = render(<ScoreText score={42} />);
    expect(container.querySelector(".text-high")?.textContent).toBe("42");
  });
});
