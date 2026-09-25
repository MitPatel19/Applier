import { expect, test } from "@playwright/test";
import { apiCall, register, seedDemo } from "./helpers";

const PAGES: [string, RegExp][] = [
  ["/dashboard", /good (morning|afternoon|evening)/i],
  ["/agent", /career agent/i],
  ["/jobs", /jobs/i],
  ["/jobs/search", /search/i],
  ["/applications", /pipeline|applications/i],
  ["/applications/history", /history/i],
  ["/interviews", /interview/i],
  ["/resumes", /resume/i],
  ["/cover-letters", /cover letters/i],
  ["/profile", /profile/i],
  ["/companies", /compan/i],
  ["/analytics", /analytics/i],
  ["/networking", /networking|contacts/i],
  ["/notifications", /notification/i],
  ["/settings", /settings/i],
];

test("every main page renders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  await register(page);
  await seedDemo(page);
  for (const [path, heading] of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("the pipeline is usable on a phone @mobile", async ({ page }) => {
  await register(page);
  await seedDemo(page);
  await page.goto("/applications");
  await expect(page.getByRole("navigation", { name: /quick navigation/i })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const apps = await apiCall<unknown[]>(page, "GET", "/applications");
  expect(apps.length).toBeGreaterThan(0);
});
