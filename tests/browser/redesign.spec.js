import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
test("field guide discovery, dedicated screening, and durable private quest rewards", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A world worth getting lost in." }),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.locator(".featured-film")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.getByRole("button", { name: /01 The wild side/ }).click();
  await expect(page).toHaveURL(/discover\?q=Animals/);
  await expect(
    page.getByRole("textbox", { name: "Search", exact: true }),
  ).toHaveValue("Animals");
  await page.locator(".video-tile").first().click();
  await expect(page.locator(".video-card video")).toHaveAttribute(
    "controls",
    "",
  );
  await expect(page.locator(".video-card")).toHaveCount(1);
  const arrangement = await page.locator(".video-actions").evaluate((el) => ({
    position: getComputedStyle(el).position,
    direction: getComputedStyle(el).flexDirection,
  }));
  expect(arrangement).toEqual({ position: "static", direction: "row" });
  await page
    .getByRole("button", { name: "Back to the club", exact: true })
    .click();
  await expect(page.locator("video")).toHaveCount(0);
  // A verified session fixture keeps this feature test independent of the
  // account-attempt quota exercised by the dedicated signup/login flows.
  const id = randomUUID(),
    token = randomUUID(),
    name = `quest_${info.project.name}`;
  const fixture = new DatabaseSync("data/e2e.sqlite");
  try {
    fixture
      .prepare(
        "INSERT INTO users(id,email,password_hash,verified,onboarded) VALUES(?,?,?,1,1)",
      )
      .run(id, `${id}@example.invalid`, "test-fixture");
    fixture
      .prepare(
        "INSERT INTO profiles(user_id,username,display_name) VALUES(?,?,?)",
      )
      .run(id, `${name}_${id.slice(0, 6)}`, "Quest Explorer");
    fixture
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(
        createHash("sha256").update(token).digest("hex"),
        id,
        Date.now() + 3600000,
      );
  } finally {
    fixture.close();
  }
  await page.context().addCookies([
    {
      name: "velo_session",
      value: token,
      url: "http://localhost:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.request.put("/api/preferences", {
    data: { interests: ["Animals"] },
  });
  const choices = await Promise.all(
    ["Animals", "Travel", "Food"].map(async (category) => {
      const response = await page.request.get(`/api/discover?q=${category}`);
      const list = (await response.json()).videos;
      return list.find((v) => v.category === category);
    }),
  );
  expect(choices.every(Boolean)).toBe(true);
  for (const video of choices)
    expect(
      (
        await page.request.post(`/api/videos/${video.id}/save`, {
          data: { active: true },
        })
      ).ok(),
    ).toBe(true);
  await page.goto("/quests");
  await page
    .getByRole("button", { name: "Collect 40 XP", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "+40 XP" }),
  ).toBeVisible();
  await expect(page.locator(".passport-level")).toContainText("40 lifetime XP");
  await expect(page.locator(".passport-stamp.earned")).toContainText(
    "Pathfinder",
  );
  await page.reload();
  await expect(page.locator(".passport-level")).toContainText("40 lifetime XP");
  await expect(
    page.getByRole("button", { name: "Collect 40 XP", exact: true }),
  ).toHaveCount(0);
  const width = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.body).toBeLessThanOrEqual(width.viewport);
  expect(errors).toEqual([]);
});
