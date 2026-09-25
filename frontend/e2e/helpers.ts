import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Str0ngPassword!";

/** Register a fresh account through the UI and land on onboarding. */
export async function register(page: Page, name = "Mit Patel") {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/register");
  await page.getByLabel(/full name/i).fill(name);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /create|sign up|get started/i }).first().click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
  return email;
}

/** Call the API with the page's session cookie (and the CSRF header). */
export async function apiCall<T = unknown>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(`/api${path}`, {
        method,
        headers: { "X-Requested-With": "applier", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.status === 204 ? null : res.json();
    },
    { method, path, body },
  ) as Promise<T>;
}

/** Load the sample profile, resumes, jobs and applications, and finish onboarding. */
export async function seedDemo(page: Page) {
  await apiCall(page, "POST", "/demo/seed");
  await apiCall(page, "PATCH", "/users/me", { onboarding_completed: true });
}
