import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent, fetch as pinnedFetch } from "undici";
import { ControlError } from "./errors";

export function publicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function providerUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ControlError("invalid_request");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname.endsWith(".") ||
    !url.hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)
  )
    throw new ControlError("invalid_request");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host) && !publicAddress(host))
    throw new ControlError("invalid_request");
  return url;
}
export async function resolveProvider(value: string, resolve = lookup) {
  const url = providerUrl(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await resolve(host, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  )
    throw new ControlError("invalid_request");
  return { url, addresses };
}
/** Resolve and pin the socket destination. Validation followed by ordinary fetch is not SSRF-safe. */
export async function providerFetch(
  value: string,
  init: {
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) {
  const { url, addresses } = await resolveProvider(value);
  const agent = new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        const first = addresses[0];
        if (!first) return callback(new Error("Provider unavailable"), "", 4);
        if (options.all) callback(null, addresses);
        else callback(null, first.address, first.family);
      },
      timeout: 10_000,
    },
    headersTimeout: 30_000,
    bodyTimeout: 60_000,
  });
  try {
    const response = await pinnedFetch(url, {
      ...init,
      dispatcher: agent,
      redirect: "error",
    });
    const reader = response.body?.getReader();
    if (!reader) {
      await agent.close();
      return new Response(null, { status: response.status });
    }
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const part = await reader.read();
          if (part.done) {
            controller.close();
            void agent.close();
          } else controller.enqueue(part.value);
        } catch {
          controller.error(new ControlError("provider_unavailable", 502));
          void agent.destroy();
        }
      },
      async cancel() {
        await reader.cancel().catch(() => {});
        await agent.destroy();
      },
    });
    return new Response(stream, {
      status: response.status,
      headers: Object.fromEntries(response.headers),
    });
  } catch {
    await agent.destroy();
    throw new ControlError("provider_unavailable", 502);
  }
}
