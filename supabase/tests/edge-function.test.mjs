// Isolated protocol tests. No Supabase project or network is used.
import assert from 'node:assert/strict';

const env = {
  ALLOWED_ORIGINS: 'https://frontend.example',
  SUPABASE_URL: 'https://project.example',
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'test-public-key' }),
  SUPABASE_ANON_KEY: 'test-legacy-key',
};
let handler, authStatus = 200, rpcStatus = 200, rpcPayload = { ok: true }, calls = [], expectedApiKey = 'test-public-key';
globalThis.Deno = { env: { get: name => env[name] }, serve: fn => { handler = fn; } };
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  assert.equal(options.headers.Authorization, 'Bearer test-user-access-token');
  assert.equal(options.headers.apikey, expectedApiKey);
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'test-user' }), { status: authStatus });
  return new Response(JSON.stringify(rpcPayload), { status: rpcStatus });
};
await import('../functions/vocabulary/index.ts');
assert.equal(typeof handler, 'function');
const uuid = '00000000-0000-4000-8000-000000000001';
async function request(body, { origin = 'https://frontend.example', method = 'POST', token = 'Bearer test-user-access-token' } = {}) {
  calls = [];
  const headers = { Origin: origin, Authorization: token, 'Content-Type': 'application/json' };
  return handler(new Request('https://project.example/functions/v1/vocabulary', { method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
}

let response = await request({}, { method: 'OPTIONS' });
assert.equal(response.status, 204); assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://frontend.example');
assert.equal(calls.length, 0);
response = await request({ action: 'list' }, { origin: 'https://other.example' });
assert.equal(response.status, 403); assert.equal(calls.length, 0); assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
response = await request({ action: 'list' }, { token: '' }); assert.equal(response.status, 401); assert.equal(calls.length, 0);
response = await request({}, { method: 'GET' }); assert.equal(response.status, 405);
for (const [body, rpc, args] of [
  [{ action: 'head' }, 'vocab_sync_head', {}],
  [{ action: 'snapshot' }, 'vocab_sync_snapshot', {}],
  [{ action: 'mutate', baseRevision: 7, operationId: uuid, operations: [{ type: 'forget', key: 'spark', forgotten: true }] }, 'vocab_sync_mutate',
    { p_base_revision: 7, p_operation_id: uuid, p_operations: [{ type: 'forget', key: 'spark', forgotten: true }] }],
  [{ action: 'replace', baseRevision: 0, operationId: uuid, backup: { format: 'ielts-vocabulary', version: 1, words: [] } }, 'vocab_sync_replace',
    { p_base_revision: 0, p_operation_id: uuid, p_backup: { format: 'ielts-vocabulary', version: 1, words: [] } }],
]) {
  response = await request(body); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { ok: true } });
  assert.equal(calls.length, 2); assert.equal(calls[1].url, `https://project.example/rest/v1/rpc/${rpc}`);
  assert.deepEqual(JSON.parse(calls[1].options.body), args);
}
for (const body of [
  { action: 'unknown' },
  { action: 'mutate', baseRevision: -1, operationId: uuid, operations: [{}] },
  { action: 'mutate', baseRevision: 0, operationId: 'bad', operations: [{}] },
  { action: 'mutate', baseRevision: 0, operationId: uuid, operations: [] },
  { action: 'mutate', baseRevision: 0, operationId: uuid, operations: Array(501).fill({}) },
  { action: 'replace', baseRevision: 0, operationId: uuid, backup: [] },
  { action: 'forget', id: uuid, forgotten: true },
]) {
  response = await request(body); assert.equal(response.status, 400); assert.equal(calls.length, 1);
}
authStatus = 401; response = await request({ action: 'list' }); assert.equal(response.status, 401); assert.equal(calls.length, 1); authStatus = 200;
rpcStatus = 403; response = await request({ action: 'head' }); assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'Database operation failed' });
rpcStatus = 400; rpcPayload = { code: '40001' }; response = await request({ action: 'mutate', baseRevision: 7, operationId: uuid, operations: [{ type: 'delete', key: 'spark' }] });
assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: 'Revision conflict', code: 'revision_conflict' });
rpcStatus = 500; rpcPayload = { message: 'private database details' }; response = await request({ action: 'snapshot' });
assert.equal(response.status, 502); assert.deepEqual(await response.json(), { error: 'Database operation failed' });
rpcStatus = 200; rpcPayload = { ok: true };
response = await request({ action: 'mutate', baseRevision: 0, operationId: uuid, operations: [{}], padding: 'x'.repeat(8 * 1024 * 1024) }); assert.equal(response.status, 413); assert.equal(calls.length, 1);
delete env.SUPABASE_PUBLISHABLE_KEYS; expectedApiKey = 'test-legacy-key';
response = await request({ action: 'head' }); assert.equal(response.status, 200); assert.equal(calls.length, 2);
env.SUPABASE_PUBLISHABLE_KEYS = '{invalid';
response = await request({ action: 'head' }); assert.equal(response.status, 200); assert.equal(calls.length, 2);
delete env.SUPABASE_ANON_KEY; env.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({ default: 'test-public-key' }); expectedApiKey = 'test-public-key';
response = await request({ action: 'head' }); assert.equal(response.status, 200); assert.equal(calls.length, 2);
delete env.SUPABASE_PUBLISHABLE_KEYS; response = await request({ action: 'head' }); assert.equal(response.status, 503); assert.equal(calls.length, 0);
console.log('PASS: cloud endpoint auth, exact-origin CORS, versioned RPC dispatch, conflict mapping, validation, size limits and error isolation. No cloud database was connected.');
