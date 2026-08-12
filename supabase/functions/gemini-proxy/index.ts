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
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
    const path = validateProxyPath(new URL(request.url).pathname, model);
    const body = await request.text();
    validateBody(request.headers.get("content-length"), body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
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
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { ...corsHeaders, "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" },
      });
    } finally {
      clearTimeout(timeout);
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
