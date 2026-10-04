import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
async function member(context, { host = false, history = false } = {}) {
  const id = randomUUID(),
    token = randomUUID(),
    name = `club_${id.slice(0, 8)}`;
  const db = new DatabaseSync("data/e2e.sqlite");
  try {
    db.prepare(
      "INSERT INTO users(id,email,password_hash,verified,onboarded,role) VALUES(?,?,?,1,1,?)",
    ).run(
      id,
      `${id}@example.invalid`,
      "test-fixture",
      host ? "admin" : "member",
    );
    db.prepare(
      "INSERT INTO profiles(user_id,username,display_name) VALUES(?,?,?)",
    ).run(id, name, "Club Explorer");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      createHash("sha256").update(token).digest("hex"),
      id,
      Date.now() + 3600000,
    );
    if (history)
      for (const [q, xp] of [
        ["scout", 40],
        ["curator", 60],
        ["maker", 100],
      ])
        db.prepare(
          "INSERT INTO quest_claims(user_id,week,quest_id,xp) VALUES(?,'2020-01-06',?,?)",
        ).run(id, q, xp);
  } finally {
    db.close();
  }
  await context.addCookies([
    {
      name: "velo_session",
      value: token,
      url: "http://localhost:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return { id, name };
}
async function fits(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("first adventure, unlocked passport, and an original-film community challenge", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const user = await member(page.context(), { history: true });
  await page.goto("/");
  await expect(page.locator(".world-hero")).toContainText("A world worth");
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.locator(".first-adventure")).toContainText(
    "Choose your direction",
  );
  await page
    .getByRole("button", { name: /Choose your direction Pick/ })
    .click();
  await page.getByRole("button", { name: "Animals", exact: true }).click();
  await page
    .getByRole("button", { name: "Save interests", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "preferences are saved" }),
  ).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("button", { name: /Find your first treasure Open/ })
    .click();
  await expect
    .poll(() => page.locator(".video-card video").evaluate((v) => v.readyState))
    .toBeGreaterThan(2);
  await page.getByRole("button", { name: "Save video", exact: true }).click();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Collect your first stamp", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "First light stamp earned" }),
  ).toBeVisible();
  await expect(page.locator(".first-adventure")).toHaveCount(0);
  await page.goto("/passport");
  await page
    .getByRole("button", { name: "Use After dark", exact: true })
    .click();
  await expect(page.locator(".passport-object")).toHaveClass(/cover-cosmos/);
  await page.getByRole("button", { name: "Use Orbit", exact: true }).click();
  await page
    .getByRole("button", { name: "Use Field explorer", exact: true })
    .click();
  await expect(page.locator(".studio-person .title-chip")).toHaveText(
    "Field explorer",
  );
  await expect(page.locator(".studio-person .signature-avatar")).toHaveClass(
    /frame-orbit/,
  );
  await page.reload();
  await expect(page.locator(".passport-object")).toHaveClass(/cover-cosmos/);
  await expect(page.locator(".studio-person .signature-avatar")).toHaveClass(
    /frame-orbit/,
  );
  await fits(page);
  await page.goto(`/@${user.name}`);
  await expect(page.locator(".profile-header .avatar")).toHaveClass(
    /frame-orbit/,
  );
  await expect(page.locator(".profile-header .title-chip")).toHaveText(
    "Field explorer",
  );
  await page.goto("/challenges");
  await expect(page.locator(".challenge-submit")).toContainText(
    "Your eligible films will appear here",
  );
  await fits(page);
  await page
    .getByRole("button", { name: "Create an original film", exact: true })
    .click();
  await page
    .getByLabel("Select video", { exact: true })
    .setInputFiles(resolve("data/media/seed-01.mp4"));
  await page
    .getByLabel("Caption", { exact: true })
    .fill(`My small wonder ${user.name}`);
  await page.getByLabel("Generate speech captions", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Post video", exact: true }).click();
  await expect(page).toHaveURL(/\/v\//, { timeout: 90000 });
  await page.goto("/challenges");
  await page
    .getByRole("button", { name: "Add to the showcase", exact: true })
    .click();
  await expect(
    page.locator(".showcase-film").filter({ hasText: user.name }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Collect 75 XP", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Trail maker stamp earned" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Reward collected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Withdraw contribution", exact: true })
    .click();
  await expect(
    page.locator(".showcase-film").filter({ hasText: user.name }),
  ).toHaveCount(0);
  const state = await (await page.request.get("/api/club")).json();
  expect(state.xp).toBe(300);
  expect(errors).toEqual([]);
  await fits(page);
});
test("private invite, feedback, triage, and honest iPhone device checklist", async ({
  page,
  browser,
}, info) => {
  await member(page.context(), { host: true });
  await page.goto("/beta");
  await page
    .getByLabel("Invitation label", { exact: true })
    .fill(`Browser ${info.project.name}`);
  await page
    .getByRole("button", { name: "Create invite", exact: true })
    .click();
  const url = await page
    .getByLabel("New beta invite link", { exact: true })
    .inputValue();
  const invited = await browser.newContext({
    baseURL: "http://localhost:3101",
    viewport: info.project.use.viewport,
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
  });
  const tester = await invited.newPage();
  await member(invited);
  await tester.goto(url);
  await tester
    .getByRole("button", { name: "Accept your invitation", exact: true })
    .click();
  await expect(tester).toHaveURL(/\/beta$/);
  await tester
    .getByLabel("Your field note", { exact: true })
    .fill(
      `A private suggestion from ${info.project.name}: I loved the passport.`,
    );
  await tester
    .getByRole("button", { name: "Send your note", exact: true })
    .click();
  await expect(tester.locator(".beta-history")).toContainText(
    "A private suggestion",
  );
  await tester
    .getByLabel("Browser and version", { exact: true })
    .fill("Automated fixture; physical Safari untested");
  await tester
    .getByRole("button", { name: "Save device check", exact: true })
    .click();
  await expect(tester.locator(".recorded-devices")).toContainText(
    "camera: untested",
  );
  await fits(tester);
  await page.reload();
  const feedback = page
    .locator(".beta-admin .feedback-note")
    .filter({ hasText: `A private suggestion from ${info.project.name}` });
  await feedback.getByRole("combobox").selectOption("reviewing");
  await tester.reload();
  await expect(tester.locator(".beta-history .note-status")).toHaveText(
    "reviewing",
  );
  const outsider = await browser.newContext({
    baseURL: "http://localhost:3101",
  });
  await member(outsider);
  const privateResponse = await outsider.request.get("/api/beta");
  expect(privateResponse.status()).toBe(403);
  await outsider.close();
  await invited.close();
  if (info.project.name === "desktop") {
    const next = await page.request.post("/api/beta/invites", {
      data: { label: "Fresh signup" },
    });
    expect(next.status()).toBe(201);
    const token = (await next.json()).token;
    const fresh = await browser.newContext({
      baseURL: "http://localhost:3101",
    });
    const signup = await fresh.newPage();
    const name = `beta_${randomUUID().slice(0, 8)}`;
    await signup.goto(`/invite?invite=${token}`);
    await signup
      .getByRole("button", { name: "Create your account", exact: true })
      .click();
    const form = signup.getByRole("dialog");
    await form
      .getByLabel("Display name", { exact: true })
      .fill("New beta friend");
    await form.getByLabel("Username", { exact: true }).fill(name);
    await form
      .getByLabel("Email", { exact: true })
      .fill(`${name}@example.invalid`);
    await form.getByLabel("Password", { exact: true }).fill("FreshBeta!2026");
    await form
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await signup
      .getByRole("button", { name: "Explore everything", exact: true })
      .click();
    await signup
      .getByRole("button", { name: "Enter the founding circle", exact: true })
      .click();
    await expect(signup).toHaveURL(/\/beta$/);
    await expect(
      signup.getByRole("heading", { name: "Leave a field note.", exact: true }),
    ).toBeVisible();
    await fresh.close();
  }
  await fits(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect
    .poll(() =>
      page
        .locator(".world-globe")
        .evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe("none");
  await page
    .getByRole("link", { name: "Skip to content", exact: true })
    .focus();
  await expect(
    page.getByRole("link", { name: "Skip to content", exact: true }),
  ).toBeVisible();
});
