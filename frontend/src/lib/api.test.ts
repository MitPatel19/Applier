import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, errorMessage } from "./api";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("sends the CSRF header on state-changing requests only", async () => {
    const fetchMock = mockFetch(200, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await api.get("/jobs");
    await api.post("/jobs/1/save");
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect((calls[0][1].headers as Record<string, string>)["X-Requested-With"]).toBeUndefined();
    expect((calls[1][1].headers as Record<string, string>)["X-Requested-With"]).toBe("applier");
  });

  it("builds query strings and skips empty values", async () => {
    const fetchMock = mockFetch(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await api.get("/jobs", { view: "saved", q: "", page: 2, tier: undefined });
    expect((fetchMock.mock.calls as unknown as [string][])[0][0]).toBe("/api/jobs?view=saved&page=2");
  });

  it("normalizes backend error envelopes into ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(409, { error: { code: "conflict", message: "Already exists", retryable: false, details: null } }),
    );
    const err = (await api.post("/applications", {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe("Already exists");
  });

  it("never surfaces raw server errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Internal Server Error", { status: 500 })));
    const err = await api.get("/jobs").catch((e) => e);
    expect(errorMessage(err)).not.toContain("Internal Server Error");
    expect((err as ApiError).retryable).toBe(true);
  });

  it("reports network failures as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const err = await api.get("/jobs").catch((e) => e);
    expect((err as ApiError).code).toBe("network");
  });
});
