// Versioned vocabulary sync. Every database request carries the caller's user JWT.
// Never use a service-role key in this function or in the static website.
type JsonObject = Record<string, unknown>;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 8 * 1024 * 1024;

function reply(status: number, payload: unknown, origin: string | null) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}) },
  });
}

Deno.serve(async (request: Request) => {
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return reply(403, { error: "Origin not allowed" }, null);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-retry-count",
    } });
  }
  if (request.method !== "POST") return reply(405, { error: "Use POST" }, origin);
  const authorization = request.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(401, { error: "Login required" }, origin);
  const url = Deno.env.get("SUPABASE_URL");
  let apiKey = Deno.env.get("SUPABASE_ANON_KEY");
  try {
    const publishableKey = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "null")?.default;
    if (typeof publishableKey === "string" && publishableKey) apiKey = publishableKey;
  } catch { /* Retain the legacy anon key if the publishable key map is unavailable. */ }
  if (!url || !apiKey) return reply(503, { error: "Cloud endpoint is not configured" }, origin);
  const headers = { apikey: apiKey, Authorization: authorization, "Content-Type": "application/json" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    // Reject invalid/expired access tokens before calling RPC. RLS is still enforced by Postgres.
    const auth = await fetch(`${url}/auth/v1/user`, { headers, signal: controller.signal });
    if (!auth.ok) return reply(401, { error: "Login expired; sign in again" }, origin);
    const statedLength = Number(request.headers.get("Content-Length") ?? 0);
    if (statedLength > MAX_BYTES) return reply(413, { error: "Request exceeds 8 MB" }, origin);
    const reader = request.body?.getReader();
    if (!reader) return reply(400, { error: "JSON body required" }, origin);
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); return reply(413, { error: "Request exceeds 8 MB" }, origin); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: JsonObject;
    try { const parsed = JSON.parse(new TextDecoder().decode(bytes)); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error(); body = parsed; }
    catch { return reply(400, { error: "Invalid JSON body" }, origin); }
    let rpc: string; let args: JsonObject;
    switch (body.action) {
      case "head": rpc = "vocab_sync_head"; args = {}; break;
      case "snapshot": rpc = "vocab_sync_snapshot"; args = {}; break;
      case "mutate":
        if (!Number.isSafeInteger(body.baseRevision) || (body.baseRevision as number) < 0
            || typeof body.operationId !== "string" || !UUID.test(body.operationId)
            || !Array.isArray(body.operations) || body.operations.length === 0 || body.operations.length > 500)
          return reply(400, { error: "Invalid sync operation batch" }, origin);
        rpc = "vocab_sync_mutate";
        args = { p_base_revision: body.baseRevision, p_operation_id: body.operationId, p_operations: body.operations };
        break;
      case "replace":
        if (!Number.isSafeInteger(body.baseRevision) || (body.baseRevision as number) < 0
            || typeof body.operationId !== "string" || !UUID.test(body.operationId)
            || !body.backup || typeof body.backup !== "object" || Array.isArray(body.backup))
          return reply(400, { error: "Invalid initial vocabulary backup" }, origin);
        rpc = "vocab_sync_replace";
        args = { p_base_revision: body.baseRevision, p_operation_id: body.operationId, p_backup: body.backup };
        break;
      default: return reply(400, { error: "Unknown action" }, origin);
    }
    const response = await fetch(`${url}/rest/v1/rpc/${rpc}`, { method: "POST", headers, body: JSON.stringify(args), signal: controller.signal });
    if (!response.ok) {
      // SQLSTATE 40001 is the optimistic revision conflict. The client reloads
      // the latest snapshot and rebases its pending word-level operations.
      const failure = await response.json().catch(() => null);
      if (failure?.code === "40001")
        return reply(409, { error: "Revision conflict", code: "revision_conflict" }, origin);
      // Do not echo database internals or imported private text to logs/responses.
      const status = response.status === 401 || response.status === 403 ? response.status
        : response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
      return reply(status, { error: "Database operation failed" }, origin);
    }
    return reply(200, { data: await response.json() }, origin);
  } catch (error) {
    return reply(error instanceof DOMException && error.name === "AbortError" ? 504 : 502, { error: "Cloud request failed; retry later" }, origin);
  } finally { clearTimeout(timeout); }
});
