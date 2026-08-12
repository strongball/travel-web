import {
  MAX_BODY_BYTES,
  ProxyError,
  validateAuthenticatedUser,
  validateBody,
  validateProxyPath,
} from "./proxy_contract.ts";

function assertThrows(action: () => void, code: string): void {
  try { action(); } catch (error) {
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

Deno.test("allows only configured model generateContent", () => {
  const path = validateProxyPath("/functions/v1/gemini-proxy/v1beta/models/gemini-test:generateContent", "gemini-test");
  if (path !== "v1beta/models/gemini-test:generateContent") throw new Error("Wrong path");
  assertThrows(() => validateProxyPath("/functions/v1/gemini-proxy/v1beta/models/other:generateContent", "gemini-test"), "ENDPOINT_NOT_ALLOWED");
  assertThrows(() => validateProxyPath("/functions/v1/gemini-proxy/v1beta/models/gemini-test:streamGenerateContent", "gemini-test"), "ENDPOINT_NOT_ALLOWED");
});

Deno.test("requires JSON object within body limit", () => {
  validateBody(null, '{"contents":[]}');
  assertThrows(() => validateBody(null, "[]"), "INVALID_REQUEST");
  assertThrows(() => validateBody(String(MAX_BODY_BYTES + 1), "{}"), "PAYLOAD_TOO_LARGE");
});
