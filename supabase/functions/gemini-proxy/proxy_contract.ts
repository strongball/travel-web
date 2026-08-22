export const MAX_BODY_BYTES = 18 * 1024 * 1024;

export class ProxyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type UserClaims = { sub?: unknown; role?: unknown; is_anonymous?: unknown };

export function validateAuthenticatedUser(authorization: string | null): void {
  if (!authorization?.startsWith("Bearer ")) {
    throw new ProxyError("UNAUTHENTICATED", "Authentication required", 401);
  }
  try {
    const payload = authorization.slice(7).split(".")[1];
    if (!payload) throw new Error("Invalid JWT");
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const claims = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    ) as UserClaims;
    if (
      typeof claims.sub !== "string" || !claims.sub ||
      claims.role !== "authenticated" || claims.is_anonymous === true
    ) throw new Error("Not authenticated");
  } catch {
    throw new ProxyError("UNAUTHENTICATED", "Authentication required", 401);
  }
}

export function validateProxyPath(pathname: string, search: string): string {
  const marker = "/gemini-proxy";
  const index = pathname.indexOf(marker);
  const rawPath = index >= 0 ? pathname.slice(index + marker.length) : pathname;
  const path = rawPath.replace(/^\/+/, "");

  const match = path.match(/^v1beta\/models\/([a-zA-Z0-9_.-]+):(generateContent|streamGenerateContent)$/);
  if (!match) {
    throw new ProxyError("ENDPOINT_NOT_ALLOWED", "Gemini endpoint is not allowed", 403);
  }

  const [, , action] = match;
  const isGenerateRequest = action === "generateContent" && search === "";
  const isStreamRequest = action === "streamGenerateContent" && search === "?alt=sse";
  if (!isGenerateRequest && !isStreamRequest) {
    throw new ProxyError("ENDPOINT_NOT_ALLOWED", "Gemini endpoint is not allowed", 403);
  }
  return `${path}${search}`;
}

export function validateBody(contentLength: string | null, body: string): void {
  const declared = contentLength === null ? null : Number(contentLength);
  if (declared !== null && Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ProxyError("PAYLOAD_TOO_LARGE", "Request exceeds size limit", 413);
  }
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new ProxyError("PAYLOAD_TOO_LARGE", "Request exceeds size limit", 413);
  }
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Not an object");
    }
  } catch {
    throw new ProxyError("INVALID_REQUEST", "Body must be a JSON object");
  }
}
