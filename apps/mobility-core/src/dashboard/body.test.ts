import { expect, it, vi } from "vitest";

vi.mock("../better-auth", () => ({ getAuth: vi.fn() }));
vi.mock("../database", () => ({ database: vi.fn() }));

import { readBoundedJson } from "./body";

function streamRequest(chunks: Uint8Array[], cancel = vi.fn()) {
  return new Request("http://localhost/test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        // Intentionally remains open: oversized body must cancel without EOF.
      },
      cancel,
    }),
    duplex: "half",
  } as RequestInit);
}
it("cancels oversized streams before reading an unlimited body", async () => {
  const cancel = vi.fn();
  const request = streamRequest([new Uint8Array(5), new Uint8Array(6)], cancel);
  await expect(readBoundedJson(request, 10)).rejects.toMatchObject({
    status: 413,
    code: "request_too_large",
  });
  expect(cancel).toHaveBeenCalledOnce();
});
it("measures UTF-8 bytes, not string length or declared Content-Length", async () => {
  const request = new Request("http://localhost/test", {
    method: "POST",
    body: JSON.stringify({ s: "éé" }),
    headers: { "content-length": "1" },
  });
  await expect(readBoundedJson(request, 10)).rejects.toMatchObject({
    status: 413,
  });
});
it("accepts bounded JSON and rejects malformed/invalid UTF-8 data", async () => {
  await expect(
    readBoundedJson(
      new Request("http://localhost/test", {
        method: "POST",
        body: '{"ok":true}',
      }),
      11,
    ),
  ).resolves.toEqual({ ok: true });
  await expect(
    readBoundedJson(
      new Request("http://localhost/test", { method: "POST", body: "{" }),
      10,
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    readBoundedJson(
      new Request("http://localhost/test", {
        method: "POST",
        body: new Uint8Array([0xff]),
      }),
      10,
    ),
  ).rejects.toMatchObject({ status: 400 });
});
