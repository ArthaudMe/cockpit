import { afterEach, describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function request(
  method: string,
  headers: Record<string, string> = {},
  path = "/api/actions/execute"
) {
  return new NextRequest(`http://localhost:3939${path}`, { method, headers });
}

describe("API trust boundary middleware", () => {
  afterEach(() => {
    delete process.env.COCKPIT_API_TOKEN;
  });

  it("allows same-origin mutations (our renderer)", () => {
    const res = middleware(request("POST", { "sec-fetch-site": "same-origin" }));
    expect(res.status).not.toBe(403);
  });

  it("allows user-initiated navigations (sec-fetch-site: none)", () => {
    const res = middleware(request("POST", { "sec-fetch-site": "none" }));
    expect(res.status).not.toBe(403);
  });

  it("blocks cross-site mutations (malicious website)", () => {
    const res = middleware(request("POST", { "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
  });

  it("blocks same-site (different subdomain) mutations", () => {
    const res = middleware(request("POST", { "sec-fetch-site": "same-site" }));
    expect(res.status).toBe(403);
  });

  it("blocks a mismatched Origin when Sec-Fetch-Site is absent", () => {
    const res = middleware(
      request("POST", { origin: "https://evil.example.com", host: "localhost:3939" })
    );
    expect(res.status).toBe(403);
  });

  it("allows a matching Origin", () => {
    const res = middleware(
      request("POST", { origin: "http://localhost:3939", host: "localhost:3939" })
    );
    expect(res.status).not.toBe(403);
  });

  it("allows header-less requests when no packaged app token is configured", () => {
    const res = middleware(request("POST", {}));
    expect(res.status).not.toBe(403);
  });

  it("blocks header-less requests when packaged app token is configured", () => {
    process.env.COCKPIT_API_TOKEN = "test-token";
    const res = middleware(request("POST", {}));
    expect(res.status).toBe(403);
  });

  it("allows requests with the packaged app token header", () => {
    process.env.COCKPIT_API_TOKEN = "test-token";
    const res = middleware(
      request("POST", {
        "x-cockpit-token": "test-token",
        "sec-fetch-site": "same-origin",
      })
    );
    expect(res.status).not.toBe(403);
  });

  it("allows requests with the packaged app token cookie", () => {
    process.env.COCKPIT_API_TOKEN = "test-token";
    const res = middleware(
      request("POST", {
        cookie: "cockpit_api_token=test-token",
        "sec-fetch-site": "same-origin",
      })
    );
    expect(res.status).not.toBe(403);
  });

  it("does not require the packaged app token for OAuth callbacks", () => {
    process.env.COCKPIT_API_TOKEN = "test-token";
    const res = middleware(request("GET", {}, "/api/datasources/callback"));
    expect(res.status).not.toBe(403);
  });

  it("does not guard safe methods (GET passes regardless of origin)", () => {
    const res = middleware(
      request("GET", { "sec-fetch-site": "cross-site" }, "/api/datasources/data")
    );
    expect(res.status).not.toBe(403);
  });
});
