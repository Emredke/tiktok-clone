import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
async function trimToTwoSeconds(page) {
  const end = page.getByLabel("Trim end", { exact: true });
  await end.press("Home");
  for (let i = 0; i < 10; i++) await end.press("ArrowRight");
  await expect(end).toHaveValue("2");
}
test("onboarding, drafts, Studio, captions, collaboration, feed controls, and staff review", async ({
  page,
  browser,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const stamp = Date.now(),
    email = `tools${stamp}@example.invalid`,
    name = `tools_${String(stamp).slice(-9)}`;
  await page.goto("/");
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email,
      password: "CreatorTools!2026",
      username: name,
      display_name: "Tools Creator",
    },
  });
  expect(signup.status()).toBe(201);
  const mail = readdirSync("data/mail")
    .map((f) => JSON.parse(readFileSync(`data/mail/${f}`, "utf8")))
    .find((m) => m.to === email);
  await page.goto(mail.url);
  await page.getByRole("button", { name: "Travel", exact: true }).click();
  await page.getByRole("button", { name: "Animals", exact: true }).click();
  await page
    .getByRole("button", { name: "Start exploring", exact: true })
    .click();
  await page.goto("/preferences");
  await expect(
    page.getByRole("button", { name: "Travel", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/create");
  await page
    .getByLabel("Select video", { exact: true })
    .setInputFiles(resolve("data/media/seed-01.mp4"));
  await page.getByLabel("Caption", { exact: true }).fill("My creator draft");
  await page
    .getByLabel("Text overlay", { exact: true })
    .fill("A moment worth sharing");
  await page.getByLabel("Generate speech captions", { exact: true }).uncheck();
  await trimToTwoSeconds(page);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.locator(".job-card")).toContainText("draft");
  await page.reload();
  await page
    .getByRole("button", { name: "Continue draft", exact: true })
    .click();
  await expect(page.getByLabel("Caption", { exact: true })).toHaveValue(
    "My creator draft",
  );
  await page
    .getByRole("button", { name: "Publish draft", exact: true })
    .click();
  await expect(page.locator(".status-pill.completed")).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole("button", { name: "Watch video", exact: true }).click();
  await expect(page).toHaveURL(/\/v\//);
  const id = page.url().split("/v/")[1];
  await page.goto("/studio");
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(page.locator(".metric-grid")).toContainText("Watch time");
  await page
    .locator(".studio-video")
    .filter({ hasText: "My creator draft" })
    .getByRole("button", { name: "Edit captions", exact: true })
    .click();
  await page.getByRole("button", { name: "Add caption", exact: true }).click();
  await page
    .getByLabel("Caption 1 text", { exact: true })
    .fill("A moment worth sharing");
  await page
    .getByRole("button", { name: "Save captions", exact: true })
    .click();
  await page.goto(`/v/${id}`);
  await expect(
    page.getByRole("button", { name: "Toggle captions", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Video options", exact: true })
    .click();
  await expect(
    page.getByText("Why this video?", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create a duet", exact: true })
    .click();
  await expect(page.locator(".collaboration-banner")).toContainText(
    "Your video appears beside the original",
  );
  await page
    .getByLabel("Select video", { exact: true })
    .setInputFiles(resolve("data/media/seed-02.mp4"));
  await page
    .getByLabel("Caption", { exact: true })
    .fill("A collaborative response");
  await page.getByLabel("Generate speech captions", { exact: true }).uncheck();
  await trimToTwoSeconds(page);
  await page.getByRole("button", { name: "Post video", exact: true }).click();
  await expect(page).toHaveURL(/\/v\//, { timeout: 90000 });
  await expect(
    page.getByRole("button", { name: /Duet · watch original/ }),
  ).toBeVisible();
  await page.goto(`/v/${id}`);
  await page
    .getByRole("button", { name: "Video options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Not interested in this video", exact: true })
    .click();
  await expect(page).toHaveURL(/\?feed=/);
  await page.goto("/preferences");
  await expect(
    page.locator(".studio-row").filter({ hasText: "My creator draft" }),
  ).toBeVisible();
  await page
    .locator(".studio-row")
    .filter({ hasText: "My creator draft" })
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(
    page.locator(".studio-row").filter({ hasText: "My creator draft" }),
  ).toHaveCount(0);
  const staff = await browser.newContext({ baseURL: "http://localhost:3101" }),
    review = await staff.newPage();
  await review.goto("/");
  await review.request.post("/api/auth/login", {
    data: { email: "comedy1@demo.velo.invalid", password: "VeloDemo!2026" },
  });
  await review.request.post("/api/reports", {
    data: {
      target_type: "video",
      target_id: id,
      reason: `Browser moderation test ${name}`,
    },
  });
  await review.goto("/moderation");
  const report = review
    .locator(".report-card")
    .filter({ hasText: `Browser moderation test ${name}` });
  await expect(report).toContainText("My creator draft");
  await report
    .getByRole("button", { name: "Remove content", exact: true })
    .click();
  await review
    .getByLabel("Review reason", { exact: true })
    .fill("Confirmed by a browser test");
  await review
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(report).toContainText("removed");
  await expect(review.locator(".audit-row").first()).toContainText(
    "Confirmed by a browser test",
  );
  await staff.close();
  const hidden = await page.request.get(`/api/videos/${id}`);
  expect(hidden.status()).toBe(404);
  await page.goto("/studio");
  const width = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.body).toBeLessThanOrEqual(width.viewport);
  expect(errors).toEqual([]);
});
