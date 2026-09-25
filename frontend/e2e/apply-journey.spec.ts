import { expect, test } from "@playwright/test";
import { apiCall, register, seedDemo } from "./helpers";

/**
 * The core promise: Discover → Analyze → Customize → Review → Confirm → Apply → Track.
 * Nothing is marked "Applied" until the user confirms they submitted.
 */
test("prepare, approve and record an application", async ({ page }) => {
  await register(page);
  await seedDemo(page);

  // Discover: open a recommended job that has no application yet.
  const jobs = await apiCall<{ items: { id: number; title: string; application_id: number | null }[] }>(
    page, "GET", "/jobs?view=recommended&page_size=20");
  const job = jobs.items.find((j) => !j.application_id)!;
  await page.goto(`/jobs/${job.id}`);
  await expect(page.getByRole("heading", { name: job.title }).first()).toBeVisible();
  await expect(page.getByText(/% Match/).first()).toBeVisible();

  // Customize: the agent prepares everything and lands on the review screen.
  await page.getByRole("button", { name: /prepare application/i }).first().click();
  await expect(page).toHaveURL(/\/applications\/\d+\/prepare/, { timeout: 45_000 });
  const appId = Number(page.url().match(/applications\/(\d+)/)![1]);
  await expect(page.getByText(/ready to apply/i).first()).toBeVisible();

  // Review: nothing has been applied yet.
  let detail = await apiCall<{ status: string; applied_at: string | null }>(page, "GET", `/applications/${appId}`);
  expect(detail.applied_at).toBeNull();

  // Confirm: explicit approval in the confirmation dialog.
  await page.getByRole("button", { name: /apply now/i }).first().click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog.getByText(/confirm application/i)).toBeVisible();
  const reviewed = dialog.getByRole("checkbox");
  if (await reviewed.count()) await reviewed.first().check();
  await dialog.getByRole("button", { name: /apply now/i }).click();

  // Apply: hand-off to the employer site — still not "Applied".
  await expect(page.getByRole("link", { name: /open application page/i }).or(
    page.getByRole("button", { name: /open application page/i })).first()).toBeVisible({ timeout: 30_000 });
  detail = await apiCall(page, "GET", `/applications/${appId}`);
  expect(detail.status).not.toBe("applied");
  expect(detail.applied_at).toBeNull();

  // Track: the user confirms they submitted.
  await page.getByRole("button", { name: /i submitted my application/i }).click();
  await expect(page.getByText(/recorded as applied/i).first()).toBeVisible({ timeout: 20_000 });
  detail = await apiCall(page, "GET", `/applications/${appId}`);
  expect(detail.status).toBe("applied");
  expect(detail.applied_at).not.toBeNull();

  // The audit trail tells the whole story.
  const audit = await apiCall<{ action: string }[]>(page, "GET", `/audit?entity_type=application&entity_id=${appId}`);
  const actions = audit.map((a) => a.action);
  expect(actions).toEqual(expect.arrayContaining(["application.prepared", "application.approved"]));
});

test("submitting without approval is refused by the server", async ({ page }) => {
  await register(page);
  await seedDemo(page);
  const apps = await apiCall<{ id: number; status: string }[]>(page, "GET", "/applications?status=ready");
  const status = await page.evaluate(async (id) => {
    const res = await fetch(`/api/applications/${id}/submit`, { method: "POST", headers: { "X-Requested-With": "applier" } });
    return res.status;
  }, apps[0].id);
  expect(status).toBe(403);
});
