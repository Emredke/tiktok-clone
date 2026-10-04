import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const deliverables = process.env.VELO_SCREENSHOT_DIR;
function mail(email, purpose) {
  return readdirSync("data/mail")
    .map((f) => JSON.parse(readFileSync(`data/mail/${f}`, "utf8")))
    .reverse()
    .find((m) => m.to === email && m.url.includes(`?${purpose}=`));
}
test("real user flow: signup → verify → watch → interact → search → profile → upload → inbox → login", async ({
  page,
  browser,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const stamp = Date.now().toString().slice(-10),
    name = `flow_${stamp}`,
    email = `${name}@example.invalid`,
    password = "FlowPassword!2026";
  await page.goto("/");
  await page.locator(".featured-film").click();
  const first = page.locator(".video-card").first();
  const initialId = await first.getAttribute("data-video-id");
  const video = first.locator("video");
  await expect
    .poll(() => video.evaluate((v) => v.readyState))
    .toBeGreaterThan(2);
  await expect
    .poll(() => video.evaluate((v) => v.currentTime))
    .toBeGreaterThan(0.1);
  if (deliverables) {
    mkdirSync(deliverables, { recursive: true });
    await page.screenshot({
      path: resolve(deliverables, `velo-${info.project.name}.png`),
    });
  }
  await first.getByRole("button", { name: "Like video", exact: true }).click();
  const auth = page.getByRole("dialog");
  await auth.getByRole("button", { name: "Join Velo", exact: true }).click();
  await auth.getByLabel("Display name", { exact: true }).fill("Flow Creator");
  await auth.getByLabel("Username", { exact: true }).fill(name);
  await auth.getByLabel("Email", { exact: true }).fill(email);
  await auth.getByLabel("Password", { exact: true }).fill(password);
  await auth
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start exploring", exact: true })
    .click();
  await expect(auth).toHaveCount(0);
  await page.goto(mail(email, "verify").url);
  await expect(page.getByRole("status")).toContainText("Email verified");
  if (
    await page
      .getByRole("button", { name: "Start exploring", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Start exploring", exact: true })
      .click();
  await page.goto(`/v/${initialId}`);
  const card = page.locator(".video-card").first();
  const id = await card.getAttribute("data-video-id");
  const creator = (await card.locator(".creator-name").innerText())
    .split("\n")[0]
    .replace("@", "");
  await card.getByRole("button", { name: "Like video", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Unlike video", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Save video", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Unsave video", exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Follow creator", exact: true })
    .click();
  await expect(
    card.getByRole("button", { name: "Unfollow creator", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Open comments" }).click();
  await page
    .getByLabel("Comment", { exact: true })
    .fill(`A real browser-tested comment ${name}`);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(
    page.getByText(`A real browser-tested comment ${name}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "Your circle", exact: true }).click();
  await expect(page.locator(".featured-film .discovery-copy")).toContainText(
    creator,
  );
  await page.getByRole("button", { name: "Club picks", exact: true }).click();
  await page.locator(".featured-film").click();
  const previousId = await page
    .locator(".video-card")
    .getAttribute("data-video-id");
  await page.getByRole("button", { name: "Next video", exact: true }).click();
  await expect(page.locator(".video-card")).not.toHaveAttribute(
    "data-video-id",
    previousId,
  );
  await expect(page.locator(".video-card")).toHaveCount(1);
  await page.goto("/discover");
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill("basketball");
  await expect(page.locator(".video-tile")).not.toHaveCount(0);
  await expect(page.locator(".tile-category").first()).toHaveText("Basketball");
  await page.goto(`/@${name}`);
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.locator(".video-tile")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page
    .getByLabel("Bio", { exact: true })
    .fill("A real profile updated in a real browser.");
  await page
    .getByLabel("Profile photo", { exact: true })
    .setInputFiles(resolve("data/media/seed-01.jpg"));
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.locator(".profile-bio")).toContainText("real browser");
  await page.goto("/create");
  if (
    await page
      .getByRole("button", { name: "Start exploring", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Start exploring", exact: true })
      .click();
  await page
    .getByLabel("Select video", { exact: true })
    .setInputFiles(resolve("data/media/seed-01.mp4"));
  await expect(page.locator(".upload-preview video")).toBeVisible();
  await page
    .getByLabel("Caption", { exact: true })
    .fill("My browser-tested original");
  await page.getByLabel("Hashtags", { exact: true }).fill("browser original");
  await page.getByLabel("Category", { exact: true }).selectOption("Education");
  await page.getByRole("button", { name: "Post video", exact: true }).click();
  await expect(page).toHaveURL(/\/v\//, { timeout: 90000 });
  await expect(page.locator(".video-caption")).toContainText(
    "My browser-tested original",
  );
  const uploaded = page.url().split("/v/")[1];
  await page.getByRole("button", { name: "Share video", exact: true }).click();
  await page
    .getByLabel("Recipient username", { exact: true })
    .fill("sports_studio2");
  await page.getByRole("button", { name: "Send video", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Video sent");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect
    .poll(() => page.locator(".video-card video").evaluate((v) => v.readyState))
    .toBeGreaterThan(2);
  const other = await browser.newContext({ baseURL: "http://localhost:3101" });
  const second = await other.newPage();
  await second.goto("/");
  await second.request.post("/api/auth/login", {
    data: { email: "sports2@demo.velo.invalid", password: "VeloDemo!2026" },
  });
  await second.request.post(`/api/videos/${uploaded}/like`, {
    data: { active: true },
  });
  await second.request.post(`/api/profiles/${name}/follow`, {
    data: { active: true },
  });
  await other.close();
  await page.goto("/inbox");
  await expect(
    page.getByText("liked your video", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("followed you", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await expect(page.locator(".notification.unread")).toHaveCount(0);
  await page.goto(`/@${name}`);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3101/");
  await page.locator(".featured-film").click();
  await page
    .locator(".video-card")
    .first()
    .getByRole("button", { name: "Like video", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.goto(`/@${name}`);
  await expect(
    page.getByRole("button", { name: "Edit profile", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".video-tile")).toHaveCount(1);
  const width = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.body).toBeLessThanOrEqual(width.viewport);
  expect(errors).toEqual([]);
});

test("camera recording produces a playable uploaded video", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera", "microphone"]);
  await page.goto("/");
  const login = await page.request.post("/api/auth/login", {
    data: { email: "sports2@demo.velo.invalid", password: "VeloDemo!2026" },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/create");
  if (
    await page
      .getByRole("button", { name: "Start exploring", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Start exploring", exact: true })
      .click();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".upload-preview video").evaluate((v) => v.currentTime),
    )
    .toBeGreaterThan(1.5);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.locator(".upload-preview video")).toBeVisible();
  await page
    .getByLabel("Caption", { exact: true })
    .fill("An original browser camera recording");
  await page.getByRole("button", { name: "Post video", exact: true }).click();
  await expect(page).toHaveURL(/\/v\//, { timeout: 90000 });
  await expect
    .poll(() => page.locator(".video-card video").evaluate((v) => v.readyState))
    .toBeGreaterThan(2);
});
