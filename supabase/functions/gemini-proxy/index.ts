import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ProxyError,
  validateAuthenticatedUser,
  validateBody,
  validateProxyPath,
} from "./proxy_contract.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info, x-goog-api-client, x-goog-api-key, x-server-timeout",
  "access-control-allow-methods": "POST, OPTIONS",
};

const STREAM_IDLE_TIMEOUT_MS = 45_000;

function forwardUpstreamBody(
  body: ReadableStream<Uint8Array> | null,
  abortController: AbortController,
): ReadableStream<Uint8Array> | null {
  if (!body) return null;

  const reader = body.getReader();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const clearTimeoutIfSettled = () => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
    settled = true;
  };
  const resetIdleTimeout = () => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = setTimeout(() => abortController.abort(), STREAM_IDLE_TIMEOUT_MS);
  };
  resetIdleTimeout();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          clearTimeoutIfSettled();
          controller.close();
          return;
        }
        resetIdleTimeout();
        controller.enqueue(result.value);
      } catch (error) {
        clearTimeoutIfSettled();
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (!settled) clearTimeoutIfSettled();
      abortController.abort();
      await reader.cancel(reason);
    },
  });
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { code: "METHOD_NOT_ALLOWED", message: "Use POST" });

  try {
    validateAuthenticatedUser(request.headers.get("authorization"));
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new ProxyError("GEMINI_NOT_CONFIGURED", "Gemini proxy is not configured", 503);
    const requestUrl = new URL(request.url);
    const path = validateProxyPath(requestUrl.pathname, requestUrl.search);
    const body = await request.text();
    validateBody(request.headers.get("content-length"), body);

    const controller = new AbortController();
    const responseTimeout = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: controller.signal,
        },
      );
      clearTimeout(responseTimeout);
      const isStreaming = requestUrl.search === "?alt=sse";
      return new Response(forwardUpstreamBody(upstream.body, controller), {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          "content-type": upstream.headers.get("content-type") || (isStreaming ? "text/event-stream" : "application/json"),
          "cache-control": isStreaming ? "no-cache, no-transform" : "no-store",
          ...(isStreaming ? { "x-accel-buffering": "no" } : {}),
        },
      });
    } catch (error) {
      clearTimeout(responseTimeout);
      throw error;
    }
  } catch (error) {
    if (error instanceof ProxyError) return json(error.status, { code: error.code, message: error.message });
    if (error instanceof DOMException && error.name === "AbortError") {
      return json(504, { code: "GEMINI_TIMEOUT", message: "Gemini request timed out" });
    }
    console.error("gemini_proxy_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return json(502, { code: "GEMINI_UPSTREAM_ERROR", message: "Gemini request failed" });
  }
});
