// Future cloud endpoint. The current website uses its local database until cloud setup.
// All database requests carry the caller's access token. Never use a service-role key here.
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
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    } });
  }
  if (request.method !== "POST") return reply(405, { error: "Use POST" }, origin);
  const authorization = request.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(401, { error: "Login required" }, origin);
  const url = Deno.env.get("SUPABASE_URL");
  const apiKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
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
      case "list": rpc = "vocab_list"; args = {}; break;
      case "import":
        if (!Array.isArray(body.entries) || body.entries.length > 5000) return reply(400, { error: "entries must contain at most 5000 items" }, origin);
        rpc = "vocab_import"; args = { p_entries: body.entries }; break;
      case "forget":
        if (typeof body.id !== "string" || !UUID.test(body.id) || typeof body.forgotten !== "boolean") return reply(400, { error: "Valid id and forgotten boolean required" }, origin);
        rpc = "vocab_set_forgotten"; args = { p_word_id: body.id, p_forgotten: body.forgotten }; break;
      case "uncollect":
        if (typeof body.sourceId !== "string" || !body.sourceId || body.sourceId.length > 3000) return reply(400, { error: "Valid sourceId required" }, origin);
        rpc = "vocab_uncollect"; args = { p_source_id: body.sourceId }; break;
      case "delete":
        if (typeof body.id !== "string" || !UUID.test(body.id)) return reply(400, { error: "Valid id required" }, origin);
        rpc = "vocab_delete"; args = { p_word_id: body.id }; break;
      default: return reply(400, { error: "Unknown action" }, origin);
    }
    const response = await fetch(`${url}/rest/v1/rpc/${rpc}`, { method: "POST", headers, body: JSON.stringify(args), signal: controller.signal });
    if (!response.ok) {
      // Do not echo database internals or imported private text to logs/responses.
      return reply(response.status === 401 || response.status === 403 ? response.status : 400, { error: "Database operation failed" }, origin);
    }
    return reply(200, { data: await response.json() }, origin);
  } catch (error) {
    return reply(error instanceof DOMException && error.name === "AbortError" ? 504 : 502, { error: "Cloud request failed; retry later" }, origin);
  } finally { clearTimeout(timeout); }
});
