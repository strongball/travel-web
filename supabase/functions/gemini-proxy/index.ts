import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  ProxyError,
  validateAuthenticatedUser,
  validateBody,
  validateProxyPath,
} from "./proxy_contract.ts";

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowedOriginEnv = Deno.env.get("ALLOWED_ORIGINS");
  let allowOrigin = "*";
  if (allowedOriginEnv) {
    const allowed = allowedOriginEnv.split(",").map((s) => s.trim());
    if (origin && allowed.includes(origin)) {
      allowOrigin = origin;
    } else {
      allowOrigin = allowed[0] || "*";
    }
  }
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info, x-goog-api-client, x-goog-api-key, x-server-timeout",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

const STREAM_IDLE_TIMEOUT_MS = 45_000;

async function verifyUserWithSupabase(authHeader: string | null): Promise<void> {
  validateAuthenticatedUser(authHeader);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (supabaseUrl && supabaseAnonKey) {
    const token = authHeader!.slice(7).trim();
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user || user.role !== "authenticated" || user.is_anonymous) {
      throw new ProxyError("UNAUTHENTICATED", "Invalid or expired authentication token", 401);
    }
  }
}

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

function json(status: number, body: Record<string, unknown>, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (request: Request) => {
  const corsHeaders = getCorsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { code: "METHOD_NOT_ALLOWED", message: "Use POST" }, corsHeaders);

  try {
    await verifyUserWithSupabase(request.headers.get("authorization"));
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
    if (error instanceof ProxyError) return json(error.status, { code: error.code, message: error.message }, corsHeaders);
    if (error instanceof DOMException && error.name === "AbortError") {
      return json(504, { code: "GEMINI_TIMEOUT", message: "Gemini request timed out" }, corsHeaders);
    }
    console.error("gemini_proxy_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return json(502, { code: "GEMINI_UPSTREAM_ERROR", message: "Gemini request failed" }, corsHeaders);
  }
});
