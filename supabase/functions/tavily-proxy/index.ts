import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ProxyError,
  validateAuthenticatedUser,
  validateSearchPayload,
} from "./tavily_contract.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const REQUEST_TIMEOUT_MS = 25_000;

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
    const apiKey = Deno.env.get("TAVILY_API_KEY");
    if (!apiKey) {
      throw new ProxyError("TAVILY_NOT_CONFIGURED", "Tavily search proxy is not configured", 503);
    }

    const rawBody = await request.text();
    let parsedBody: unknown;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      throw new ProxyError("INVALID_REQUEST", "Body must be valid JSON");
    }

    const params = validateSearchPayload(parsedBody);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const upstream = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: params.query,
          search_depth: params.search_depth,
          topic: params.topic,
          include_answer: true,
          max_results: 5,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!upstream.ok) {
        const errorText = await upstream.text().catch(() => "");
        console.error("tavily_upstream_failed", { status: upstream.status, errorText });
        throw new ProxyError(
          "TAVILY_UPSTREAM_ERROR",
          "Tavily search upstream request failed",
          upstream.status >= 400 && upstream.status < 500 ? 502 : upstream.status,
        );
      }

      const data = await upstream.json() as Record<string, unknown>;
      const results = Array.isArray(data.results)
        ? data.results.map((r: Record<string, unknown>) => ({
            title: typeof r.title === "string" ? r.title : "",
            url: typeof r.url === "string" ? r.url : "",
            content: typeof r.content === "string" ? r.content : "",
          }))
        : [];

      return json(200, {
        query: params.query,
        answer: typeof data.answer === "string" ? data.answer : null,
        results,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    if (error instanceof ProxyError) {
      return json(error.status, { code: error.code, message: error.message });
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return json(504, { code: "TAVILY_TIMEOUT", message: "Tavily request timed out" });
    }
    console.error("tavily_proxy_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return json(502, { code: "TAVILY_INTERNAL_ERROR", message: "Tavily search failed" });
  }
});
