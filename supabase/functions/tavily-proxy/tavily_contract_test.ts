declare const Deno: any;
import {
  MAX_QUERY_LENGTH,
  ProxyError,
  validateAuthenticatedUser,
  validateSearchPayload,
} from "./tavily_contract.ts";

function assertThrows(action: () => void, code: string): void {
  try {
    action();
  } catch (error) {
    if (error instanceof ProxyError && error.code === code) return;
    throw error;
  }
  throw new Error(`Expected ${code}`);
}

function jwt(payload: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `header.${encoded}.signature`;
}

Deno.test("accepts authenticated non-anonymous users", () => {
  validateAuthenticatedUser(`Bearer ${jwt({ sub: "user", role: "authenticated" })}`);
  assertThrows(() => validateAuthenticatedUser(null), "UNAUTHENTICATED");
  assertThrows(() => validateAuthenticatedUser(`Bearer ${jwt({ sub: "anon", role: "authenticated", is_anonymous: true })}`), "UNAUTHENTICATED");
});

Deno.test("validates search payload", () => {
  const valid = validateSearchPayload({ query: "東京 晴空塔 門票" });
  if (valid.query !== "東京 晴空塔 門票" || valid.search_depth !== "basic" || valid.topic !== "general") {
    throw new Error("Validation mismatch");
  }

  const advanced = validateSearchPayload({
    query: "最新天氣",
    search_depth: "advanced",
    topic: "news",
  });
  if (advanced.search_depth !== "advanced" || advanced.topic !== "news") {
    throw new Error("Options mismatch");
  }

  const longQuery = "a".repeat(MAX_QUERY_LENGTH + 50);
  const truncated = validateSearchPayload({ query: longQuery });
  if (truncated.query.length !== MAX_QUERY_LENGTH) {
    throw new Error("Query was not truncated to MAX_QUERY_LENGTH");
  }

  assertThrows(() => validateSearchPayload(null), "INVALID_REQUEST");
  assertThrows(() => validateSearchPayload({}), "INVALID_REQUEST");
  assertThrows(() => validateSearchPayload({ query: "   " }), "INVALID_REQUEST");
});
