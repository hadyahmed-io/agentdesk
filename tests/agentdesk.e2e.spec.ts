import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const screenshotsDir = path.resolve(process.cwd(), "docs/screenshots");

test.describe("AgentDesk Critical End-to-End Workflow", () => {
  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test("Full lifecycle: Open AgentDesk -> Create Project -> Create Task -> Start Demo Run -> Inspect Logs -> Reload & Verify Persistence", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Open AgentDesk
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Workspace Overview" })
    ).toBeVisible();

    // Capture Dashboard screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, "01-dashboard.png"),
      fullPage: false,
    });

    // 2. Navigate to Projects and Create a Project
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Projects", exact: true })
    ).toBeVisible();

    await page.getByRole("button", { name: /New Project/i }).click();
    const projectName = `E2E Portfolio Service ${Date.now().toString().slice(-4)}`;
    await page.getByLabel(/Project Name/i).fill(projectName);
    await page
      .getByLabel(/Description/i)
      .fill("Automated end-to-end verified microservice workspace.");
    await page.getByLabel(/Primary Language/i).fill("TypeScript");
    await page.getByLabel(/Framework \/ Stack/i).fill("Express + SQLite");
    await page.getByLabel(/Project Tags/i).fill("e2e, portfolio, typescript");
    await page.getByRole("button", { name: /Create Project/i }).click();

    // Should navigate to Project Detail page
    await expect(
      page.getByRole("heading", { name: projectName })
    ).toBeVisible();

    await page.screenshot({
      path: path.join(screenshotsDir, "02-project-detail.png"),
      fullPage: false,
    });

    // 3. Create a Task inside the Project
    await page.getByRole("button", { name: /Add Task/i }).click();
    const taskTitle = "Implement structured request validation";
    await page.getByLabel(/Task Title/i).fill(taskTitle);
    await page
      .getByLabel(/Description/i)
      .fill("Add Zod request body validation and return 400 with field details.");
    await page
      .getByPlaceholder(/Add an acceptance criterion/i)
      .fill("Rejects empty title with HTTP 400");
    await page.getByRole("button", { name: /^Add$/i }).click();
    await page.getByRole("button", { name: /Create Task/i }).click();

    // Navigate to the newly created Task Detail page
    await page.getByRole("link", { name: taskTitle }).first().click();
    await expect(
      page.getByRole("heading", { name: taskTitle })
    ).toBeVisible();

    await page.screenshot({
      path: path.join(screenshotsDir, "03-task-detail.png"),
      fullPage: false,
    });

    // 4 & 5. Choose the Demo Provider and Start a Run
    await page.getByRole("button", { name: /Start Agent Run/i }).click();
    await expect(
      page.getByRole("heading", { name: "Launch Agent Execution Run" })
    ).toBeVisible();
    await page.getByLabel(/Stage Pacing/i).selectOption("250");
    await page
      .getByRole("button", { name: /Start Simulated Demo Run/i })
      .click();

    // 6, 7 & 8. Observe Run Detail page, wait for Completion, and Verify Logs
    await expect(
      page.getByText(/Execution Timeline & Structured Logs/i)
    ).toBeVisible();

    await expect(
      page.getByText(/Completed simulated workflow/i).first()
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByText(/SIMULATED:simulated\.complete/i)
    ).toBeVisible();

    await page.screenshot({
      path: path.join(screenshotsDir, "04-run-detail-logs.png"),
      fullPage: false,
    });

    // Visit Providers page to capture screenshot
    await page.getByRole("link", { name: "Providers", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Agent Providers" })
    ).toBeVisible();
    await page.screenshot({
      path: path.join(screenshotsDir, "05-providers.png"),
      fullPage: false,
    });

    // 9 & 10. Reload the application and confirm persisted data remains available
    await page.goto("/projects");
    await page.reload();
    await expect(page.getByText(projectName).first()).toBeVisible();
  });
});
