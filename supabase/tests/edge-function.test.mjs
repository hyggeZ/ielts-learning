// Isolated protocol tests. No Supabase project or network is used.
import assert from 'node:assert/strict';

const env = {
  ALLOWED_ORIGINS: 'https://frontend.example',
  SUPABASE_URL: 'https://project.example',
  SUPABASE_ANON_KEY: 'test-public-key',
};
let handler, authStatus = 200, rpcStatus = 200, calls = [];
globalThis.Deno = { env: { get: name => env[name] }, serve: fn => { handler = fn; } };
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  assert.equal(options.headers.Authorization, 'Bearer test-user-access-token');
  assert.equal(options.headers.apikey, 'test-public-key');
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'test-user' }), { status: authStatus });
  return new Response(JSON.stringify({ ok: true }), { status: rpcStatus });
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
  [{ action: 'list' }, 'vocab_list', {}],
  [{ action: 'import', entries: [{ word: 'spark', meaning: '引发' }] }, 'vocab_import', { p_entries: [{ word: 'spark', meaning: '引发' }] }],
  [{ action: 'forget', id: uuid, forgotten: true }, 'vocab_set_forgotten', { p_word_id: uuid, p_forgotten: true }],
  [{ action: 'forget', id: uuid, forgotten: false }, 'vocab_set_forgotten', { p_word_id: uuid, p_forgotten: false }],
  [{ action: 'uncollect', sourceId: 'essay:1:0:spark' }, 'vocab_uncollect', { p_source_id: 'essay:1:0:spark' }],
  [{ action: 'delete', id: uuid }, 'vocab_delete', { p_word_id: uuid }],
]) {
  response = await request(body); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { ok: true } });
  assert.equal(calls.length, 2); assert.equal(calls[1].url, `https://project.example/rest/v1/rpc/${rpc}`);
  assert.deepEqual(JSON.parse(calls[1].options.body), args);
}
for (const body of [{ action: 'unknown' }, { action: 'delete', id: 'bad' }, { action: 'forget', id: uuid, forgotten: 'true' }, { action: 'import', entries: {} }, { action: 'uncollect', sourceId: '' }]) {
  response = await request(body); assert.equal(response.status, 400); assert.equal(calls.length, 1);
}
authStatus = 401; response = await request({ action: 'list' }); assert.equal(response.status, 401); assert.equal(calls.length, 1); authStatus = 200;
rpcStatus = 403; response = await request({ action: 'list' }); assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'Database operation failed' }); rpcStatus = 200;
response = await request({ action: 'import', entries: [], padding: 'x'.repeat(8 * 1024 * 1024) }); assert.equal(response.status, 413); assert.equal(calls.length, 1);
delete env.SUPABASE_ANON_KEY; response = await request({ action: 'list' }); assert.equal(response.status, 503); assert.equal(calls.length, 0);
console.log('PASS: optional cloud endpoint auth, exact-origin CORS, RPC actions, validation, size limits and error isolation. No cloud database was connected.');
