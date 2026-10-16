import { afterEach, describe, it, expect } from "vitest";
import {
  claimRenderInput,
  releaseRenderInput,
  localRenderAvailable,
  readBoundedJson,
  createRender,
} from "./local-render";
const original = process.env.DIRECTOR_LOCAL_RENDER;
afterEach(() => {
  if (original === undefined) delete process.env.DIRECTOR_LOCAL_RENDER;
  else process.env.DIRECTOR_LOCAL_RENDER = original;
  releaseRenderInput();
});
describe("Local renderer boundary and admission", () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request("http://localhost:3002/api/exports", {
      headers: {
        host: "localhost:3002",
        origin: "http://localhost:3002",
        ...headers,
      },
    });
  it("is disconnected by default and permits only explicitly enabled direct local requests", () => {
    delete process.env.DIRECTOR_LOCAL_RENDER;
    expect(localRenderAvailable(request())).toBe(false);
    process.env.DIRECTOR_LOCAL_RENDER = "1";
    expect(
      localRenderAvailable(request({ "x-forwarded-for": "127.0.0.1" })),
    ).toBe(true);
    expect(
      localRenderAvailable(request({ origin: "https://attacker.invalid" })),
    ).toBe(false);
    expect(
      localRenderAvailable(request({ "sec-fetch-site": "cross-site" })),
    ).toBe(false);
    expect(localRenderAvailable(request({ host: "external.invalid" }))).toBe(
      false,
    );
    expect(
      localRenderAvailable(
        request({ "x-forwarded-for": "127.0.0.1, 203.0.113.1" }),
      ),
    ).toBe(false);
    expect(localRenderAvailable(request({ forwarded: "for=127.0.0.1" }))).toBe(
      false,
    );
  });
  it("admits only one request body at a time and releases invalid jobs", async () => {
    expect(claimRenderInput()).toBe(true);
    expect(claimRenderInput()).toBe(false);
    releaseRenderInput();
    await expect(createRender({ schemaVersion: 99 })).rejects.toThrow();
    expect(claimRenderInput()).toBe(true);
  });
  it("rejects declared oversized input before reading it", async () => {
    const request = new Request("http://localhost/api/exports", {
      method: "POST",
      headers: { "content-length": String(65 * 1024 * 1024) },
      body: "{}",
    });
    await expect(readBoundedJson(request)).rejects.toThrow("64 MB");
  });
});
