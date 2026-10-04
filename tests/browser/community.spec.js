import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
async function login(page, email) {
  await page.goto("/");
  const r = await page.request.post("/api/auth/login", {
    data: { email, password: "VeloDemo!2026" },
  });
  expect(r.status()).toBe(200);
  await page.request.put("/api/preferences", {
    data: { interests: ["Travel"] },
  });
}
test("private history, collections, conversation requests, live replies and sound recording work on screen", async ({
  page,
  browser,
}, info) => {
  const draftCaption = `A voice and music draft ${info.project.name} ${Date.now()}`;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "comedy1@demo.velo.invalid");
  await page.request.post("/api/videos/seed-01/view", {
    data: {
      position: 2,
      watch_seconds: 3,
      completion: 0.4,
      rewatches: 0,
      skip_seconds: 3,
    },
  });
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Your Library." }),
  ).toBeVisible();
  await expect(page.locator(".library-video").first()).toBeVisible();
  await page.getByText("Continue watching", { exact: true }).first().click();
  await expect(page).toHaveURL(/\/v\/seed-01\?resume=2/);
  await expect(page.locator(".video-card").first()).toHaveAttribute(
    "data-video-id",
    "seed-01",
  );
  await page.goto("/library");
  await page.getByRole("button", { name: "Collections & playlists" }).click();
  const collection = `My favorites ${info.project.name} ${Date.now()}`;
  await page
    .getByRole("textbox", { name: "Collection name", exact: true })
    .fill(collection);
  await page
    .getByRole("main")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: new RegExp(collection) }),
  ).toBeVisible();
  await page.goto("/v/seed-01");
  await page
    .getByRole("button", { name: "Video options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to collection or playlist", exact: true })
    .click();
  await page.getByRole("button", { name: new RegExp(collection) }).click();
  await page.goto("/library");
  await page.getByRole("button", { name: "Collections & playlists" }).click();
  await page.getByRole("button", { name: new RegExp(collection) }).click();
  await expect(page.locator(".library-video")).toHaveCount(1);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Privacy & notifications." }),
  ).toBeVisible();
  await page.getByLabel("Who can message you?").selectOption("friends");
  await expect(page.getByLabel("Who can message you?")).toHaveValue("friends");
  await page.getByLabel("Who can message you?").selectOption("requests");
  const other = await browser.newContext(
    info.project.name === "mobile"
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        }
      : {},
  );
  const peer = await other.newPage();
  peer.on("pageerror", (e) => errors.push(e.message));
  await login(peer, "sports2@demo.velo.invalid");
  await peer.goto("/chat?to=comedy_studio1");
  await page.goto("/chat?to=sports_studio2");
  const body = `Hello from ${info.project.name} ${Date.now()}`;
  const responseText = `Welcome ${info.project.name} ${Date.now()}`;
  await page.getByLabel("Message", { exact: true }).fill(body);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    peer.locator(".chat-bubble").filter({ hasText: body }),
  ).toBeVisible({ timeout: 10000 });
  const accept = peer.getByRole("button", {
    name: "Accept request",
    exact: true,
  });
  if (await accept.isVisible()) await accept.click();
  await peer
    .locator(".chat-bubble")
    .filter({ hasText: body })
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  await peer.getByLabel("Message", { exact: true }).fill(responseText);
  await peer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.locator(".chat-bubble p").filter({ hasText: responseText }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.locator(".chat-bubble").filter({ hasText: body }).first(),
  ).toContainText("Read", { timeout: 10000 });
  await other.close();
  await page.goto("/create");
  await page
    .getByLabel("Select video", { exact: true })
    .setInputFiles(resolve("data/media/seed-01.mp4"));
  await page.getByLabel("Caption", { exact: true }).fill(draftCaption);
  await page.getByLabel("Generate speech captions", { exact: true }).uncheck();
  await page
    .getByLabel("Music or effect", { exact: true })
    .selectOption("morning");
  await expect(page.getByText("CC0 1.0", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Record voiceover", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Stop ·/ })).toBeVisible();
  await expect
    .poll(async () =>
      page.getByRole("button", { name: /Stop ·/ }).textContent(),
    )
    .toMatch(/Stop · [2-9]s/);
  await page.getByRole("button", { name: /Stop ·/ }).click();
  await expect(
    page.getByRole("button", { name: "Remove from this video", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(
    page.locator(".job-card").filter({ hasText: draftCaption }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
