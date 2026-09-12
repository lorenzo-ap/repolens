import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage of the public (unauthenticated) experience. Requires the API and web app
 * running with a seeded demo repository (`pnpm seed:demo`).
 */

test.describe("landing", () => {
  test("explains the product and links to the demo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Know where a codebase is healthy",
    );
    await expect(page.getByText("Demo · latest analysis")).toBeVisible();
    await page.getByRole("link", { name: /Explore the demo/ }).click();
    await expect(page).toHaveURL(/\/r\/[^/]+\/[^/]+$/);
  });
});

test.describe("demo repository", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo");
    await expect(page).toHaveURL(/\/r\//);
  });

  test("dashboard shows score, categories, trend and findings", async ({ page }) => {
    await expect(page.getByText("Demo data")).toBeVisible();
    await expect(page.getByRole("img", { name: /Health score: \d+ of 100/ })).toBeVisible();
    await expect(page.getByText("Code quality").first()).toBeVisible();
    await expect(page.getByText("Health trend")).toBeVisible();
    await expect(page.getByText("Top findings")).toBeVisible();
    await page.getByRole("button", { name: "How is this computed?" }).click();
    await expect(page.getByText("Score derivation")).toBeVisible();
    await expect(page.getByText("Linter configured")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Score derivation")).toBeHidden();
    // Re-analyze must not be offered to anonymous visitors.
    await expect(page.getByRole("button", { name: /Re-analyze|Analyze/ })).toHaveCount(0);
  });

  test("findings can be filtered, sorted, searched and opened", async ({ page }) => {
    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("link", { name: /^Findings/ })
      .click();
    await expect(page).toHaveURL(/\/findings/);
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    const initialCount = await page
      .getByText(/\d+ findings?$/)
      .first()
      .textContent();

    // Severity filter via URL state (the rail collapses into a popover on narrow screens).
    const filtersButton = page.getByRole("button", { name: /^Filters/ });
    if (await filtersButton.isVisible()) await filtersButton.click();
    await page.getByRole("checkbox", { name: /High/ }).first().click();
    await expect(page).toHaveURL(/severity=high/);
    await page.keyboard.press("Escape");
    await expect(rows.first().locator("td").first()).toContainText(/High/i);
    await page.getByRole("button", { name: "Remove filter" }).first().click();
    await expect(page).not.toHaveURL(/severity=high/);

    // Text search narrows results.
    await page.getByLabel("Search findings").fill("complexity");
    await expect(page).toHaveURL(/q=complexity/);
    await expect(rows.first()).toContainText(/complexity/i);
    const narrowed = await page
      .getByText(/\d+ findings?$/)
      .first()
      .textContent();
    expect(narrowed).not.toBe(initialCount);
    await page.getByLabel("Search findings").fill("");

    // Sort by file.
    await page.getByLabel("Sort findings").selectOption("file");
    await expect(page).toHaveURL(/sort=file/);
    await page.waitForLoadState("networkidle");

    // Open a finding and see its detail.
    await rows.first().click();
    await expect(page).toHaveURL(/finding=/);
    await expect(page.getByRole("dialog")).toContainText("Recommendation");
    await expect(
      page.getByText("Issue creation is disabled for the demo repository."),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/finding=/);
  });

  test("keyboard navigation works in findings", async ({ page }) => {
    await page.goto((await page.url()).replace(/\/?$/, "/findings"));
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.keyboard.press("/");
    await expect(page.getByLabel("Search findings")).toBeFocused();
  });

  test("architecture graph renders and drills into a directory", async ({ page }) => {
    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("link", { name: "Architecture" })
      .click();
    await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await page.locator(".react-flow__node").first().click();
    await page.getByRole("button", { name: "Open files" }).click();
    await expect(page).toHaveURL(/root=/);
    await page.getByRole("button", { name: "Directories" }).click();
    await expect(page).not.toHaveURL(/root=/);
    await page.getByRole("button", { name: "Force" }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
  });

  test("history compares two analyses", async ({ page }) => {
    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("link", { name: /^History/ })
      .click();
    await expect(page.getByText("Compare analyses")).toBeVisible();
    await expect(page.getByText("New findings")).toBeVisible();
    await expect(page.getByText("Resolved findings")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Test cases" })).toBeVisible();
    await expect(page.getByText("All analyses")).toBeVisible();
    await expect(page.getByRole("link", { name: "View", exact: true }).first()).toBeVisible();
  });

  test("older analyses can be selected and flagged as stale", async ({ page }) => {
    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("link", { name: /^History/ })
      .click();
    await page.getByRole("link", { name: "View", exact: true }).first().click();
    await expect(page).toHaveURL(/analysis=/);
    await expect(page.getByText(/Viewing the analysis from/)).toBeVisible();
    await page.getByRole("link", { name: "View latest" }).click();
    await expect(page).not.toHaveURL(/analysis=/);
  });

  test("command palette navigates", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Jump to a page or repository…")).toBeVisible();
    await page.keyboard.type("Architecture");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/architecture/);
  });
});

test.describe("errors and access", () => {
  test("unknown repository shows a helpful not-found state", async ({ page }) => {
    await page.goto("/r/nobody/nothing");
    await expect(page.getByRole("heading", { name: "Repository not found" })).toBeVisible();
  });

  test("protected pages redirect anonymous visitors", async ({ page }) => {
    await page.goto("/repos");
    await expect(page).toHaveURL(/auth=required/);
  });

  test("theme toggle switches to dark mode", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Switch to dark theme/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
